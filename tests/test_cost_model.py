"""
Guards the derived cost model and the cost-ratio sensitivity sweep.

- derive_costs() must compute FN/FP from the dataset via the documented CLV
  formula, not return the old hardcoded 10000/500.
- cost_sensitivity_curve() must reuse the exact cost curve and be monotonic in
  the ratio (heavier FN never raises the optimal threshold).
- /cost-sensitivity must respond to the FP input and 404 before any run.
"""
import os

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

import main
from pipeline import (GROSS_MARGIN, OFFER_DURATION_MONTHS, RETENTION_DISCOUNT,
                      cost_sensitivity_curve, cost_threshold_curve, derive_costs)

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "data", "telco_churn.csv")


@pytest.mark.skipif(not os.path.exists(DATA), reason="dataset missing")
def test_derive_costs_uses_the_documented_formula():
    df = pd.read_csv(DATA)
    fn, fp, d = derive_costs(df)

    assert d["method"] == "clv_derived"
    assert fn != 10000 or fp != 500, "costs must be derived, not the old constants"

    avg = float(pd.to_numeric(df["MonthlyCharges"], errors="coerce").mean())
    retained = pd.to_numeric(df.loc[df["Churn"].str.lower() == "no", "tenure"], errors="coerce")
    lifetime = float(retained.mean())

    assert fn == round(avg * lifetime * GROSS_MARGIN)
    assert fp == round(RETENTION_DISCOUNT * avg * OFFER_DURATION_MONTHS)
    assert fn > fp > 0


def test_derive_costs_falls_back_without_columns():
    fn, fp, d = derive_costs(pd.DataFrame({"x": [1, 2, 3]}))
    assert d["method"] == "fallback_constants"
    assert (fn, fp) == (10000, 500)


@pytest.fixture
def synthetic():
    rng = np.random.default_rng(3)
    y = rng.integers(0, 2, size=400)
    probs = np.clip(0.5 * y + rng.normal(0, 0.3, size=400) + 0.25, 0.001, 0.999)
    return y, probs


def test_sensitivity_optimum_matches_the_real_curve(synthetic):
    y, probs = synthetic
    points = cost_sensitivity_curve(y, probs, cost_fp=40, ratios=[1, 5, 20, 100])
    for p in points:
        curve = cost_threshold_curve(y, probs, p["cost_fn"], p["cost_fp"])
        best = min(curve, key=lambda r: r["cost"])
        assert p["optimal_cost"] == best["cost"]
        assert p["optimal_threshold"] == best["threshold"]


def test_sensitivity_threshold_monotonic_in_ratio(synthetic):
    y, probs = synthetic
    points = cost_sensitivity_curve(y, probs, cost_fp=40)
    thresholds = [p["optimal_threshold"] for p in points]  # ratios ascending
    assert all(a >= b - 1e-9 for a, b in zip(thresholds, thresholds[1:])), \
        "optimal threshold must not rise as the FN/FP ratio grows"


@pytest.fixture
def client_with_oof():
    rng = np.random.default_rng(5)
    y = rng.integers(0, 2, size=400)
    probs = np.clip(0.45 * y + rng.normal(0, 0.25, size=400) + 0.3, 0.001, 0.999)
    with main._results_lock:
        main._last_results.clear()
        main._last_results.update({
            "best_model": "Random Forest", "cost_fn": 751, "cost_fp": 39,
            "cost_derivation": {"method": "clv_derived", "avg_monthly_charges": 65.3},
            "validation_oof": {"model": "Random Forest",
                               "y_true": [int(v) for v in y],
                               "probs": [float(p) for p in probs]},
        })
    yield TestClient(main.app)
    with main._results_lock:
        main._last_results.clear()


def test_cost_sensitivity_endpoint_404_before_run():
    with main._results_lock:
        main._last_results.clear()
    assert TestClient(main.app).get("/cost-sensitivity").status_code == 404


def test_cost_sensitivity_endpoint_responds_to_fp(client_with_oof):
    a = client_with_oof.get("/cost-sensitivity", params={"cost_fp": 39}).json()
    b = client_with_oof.get("/cost-sensitivity", params={"cost_fp": 400}).json()
    assert a["cost_fp"] == 39 and b["cost_fp"] == 400
    assert [p["optimal_cost"] for p in a["points"]] != [p["optimal_cost"] for p in b["points"]]
    assert a["cost_derivation"]["method"] == "clv_derived"
    # ratios must span a real range and thresholds stay monotonic
    thr = [p["optimal_threshold"] for p in a["points"]]
    assert all(x >= y - 1e-9 for x, y in zip(thr, thr[1:]))

"""
Guards against AUDIT.md §4.B ever coming back: the cost-vs-threshold curve must
be REAL (exact confusion-matrix evaluation of out-of-fold predictions), must
respond to the FN/FP cost inputs, and must be what the pipeline actually ships.

The old frontend fabricated the curve from a single confusion matrix via a
sigmoid/exponential ramp. Such a curve fails `test_curve_cost_is_exact` because
its per-threshold FN/FP are rounded estimates, not the true confusion matrix.
"""
import os

import numpy as np
import pandas as pd
import pytest
from sklearn.model_selection import train_test_split

from churn_intel.config import THRESHOLD_GRID
from churn_intel.costs import cost_threshold_curve, find_best_threshold
from churn_intel.pipeline import run_pipeline

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "data", "telco_churn.csv")


def _direct_cost(y_true, probs, t, cost_fn, cost_fp):
    """Independent brute-force cost at threshold t (no shared code with the curve)."""
    pred = (np.asarray(probs) >= t).astype(int)
    y = np.asarray(y_true)
    fn = int(((pred == 0) & (y == 1)).sum())
    fp = int(((pred == 1) & (y == 0)).sum())
    return fn * cost_fn + fp * cost_fp


@pytest.fixture(scope="module")
def synthetic():
    rng = np.random.default_rng(7)
    y = rng.integers(0, 2, size=500)
    probs = np.clip(0.5 * y + rng.normal(0, 0.3, size=500) + 0.25, 0.001, 0.999)
    return y, probs


def test_curve_cost_is_exact(synthetic):
    """Every plotted cost must equal a directly-computed confusion-matrix cost.

    A fabricated/interpolated curve cannot pass this.
    """
    y, probs = synthetic
    curve = cost_threshold_curve(y, probs, cost_fn=10000, cost_fp=500)
    assert len(curve) == len(THRESHOLD_GRID)
    for row in curve:
        expected = _direct_cost(y, probs, row["threshold"], 10000, 500)
        assert row["cost"] == expected, f"cost mismatch at t={row['threshold']}"
        assert row["cost"] == row["fn"] * 10000 + row["fp"] * 500
        assert row["tp"] + row["fp"] + row["fn"] + row["tn"] == len(y)


def test_curve_changes_with_costs(synthetic):
    """The cost inputs must actually change the curve — the whole point of §4.B."""
    y, probs = synthetic
    cheap = cost_threshold_curve(y, probs, cost_fn=10000, cost_fp=500)
    fn_heavy = cost_threshold_curve(y, probs, cost_fn=50000, cost_fp=500)

    assert [r["cost"] for r in cheap] != [r["cost"] for r in fn_heavy], \
        "curve did not respond to a 5x FN cost change"

    # A heavier FN penalty should never raise the cost-optimal threshold.
    opt_a = min(cheap, key=lambda r: r["cost"])["threshold"]
    opt_b = min(fn_heavy, key=lambda r: r["cost"])["threshold"]
    assert opt_b <= opt_a


def test_curve_optimal_matches_find_best_threshold(synthetic):
    """The curve's argmin must be at least as good as find_best_threshold."""
    y, probs = synthetic
    curve = cost_threshold_curve(y, probs, 10000, 500, grid=THRESHOLD_GRID)
    curve_opt = min(curve, key=lambda r: r["cost"])
    _, best_c = find_best_threshold(y, probs, 10000, 500)  # coarser 50-pt grid
    assert curve_opt["cost"] <= best_c


def test_recall_is_monotonic_non_increasing(synthetic):
    """Real sweeps have non-increasing recall as the threshold rises."""
    y, probs = synthetic
    curve = cost_threshold_curve(y, probs, 10000, 500)
    recalls = [r["recall"] for r in curve]
    assert all(a >= b - 1e-9 for a, b in zip(recalls, recalls[1:]))


@pytest.mark.slow
@pytest.mark.skipif(not os.path.exists(DATA), reason="demo dataset not present")
def test_pipeline_ships_the_real_curve():
    """End-to-end: the curve the pipeline publishes must equal a fresh, direct
    recomputation from the persisted out-of-fold predictions — proving the
    dashboard is fed real data, not a client-side fabrication.
    """
    df = pd.read_csv(DATA)
    # Stratified subsample keeps the test fast but representative.
    df, _ = train_test_split(
        df, train_size=1400, stratify=df["Churn"], random_state=42
    )
    df = df.reset_index(drop=True)

    results = run_pipeline(df)

    assert "validation_oof" in results
    assert "threshold_curve" in results
    oof = results["validation_oof"]
    shipped = results["threshold_curve"]

    assert len(oof["y_true"]) == len(oof["probs"])

    recomputed = cost_threshold_curve(
        np.asarray(oof["y_true"]), np.asarray(oof["probs"]),
        results["cost_fn"], results["cost_fp"],
    )
    assert shipped["curve"] == recomputed, "shipped curve != direct recomputation"

    other = cost_threshold_curve(
        np.asarray(oof["y_true"]), np.asarray(oof["probs"]),
        results["cost_fn"] * 4, results["cost_fp"],
    )
    assert [r["cost"] for r in other] != [r["cost"] for r in shipped["curve"]]

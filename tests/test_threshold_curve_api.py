"""
HTTP-level guard for AUDIT.md §4.B: the FN/FP costs the dashboard sends must
reach the backend and change the returned curve, and the curve must be exact.

Fast: injects synthetic out-of-fold predictions instead of training a model.
The full train-and-publish path is covered by
tests/test_threshold_curve.py::test_pipeline_ships_the_real_curve (slow).
"""
import numpy as np
import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def client_with_oof():
    """A backend that has 'completed a run', with known validation predictions."""
    rng = np.random.default_rng(11)
    y = rng.integers(0, 2, size=400)
    probs = np.clip(0.45 * y + rng.normal(0, 0.25, size=400) + 0.3, 0.001, 0.999)

    with main._results_lock:
        main._last_results.clear()
        main._last_results.update({
            "best_model": "CatBoost",
            "best_threshold": 0.07,
            "cost_fn": 10000,
            "cost_fp": 500,
            "validation_oof": {
                "model": "CatBoost",
                "y_true": [int(v) for v in y],
                "probs": [float(p) for p in probs],
            },
        })

    yield TestClient(main.app), y, probs

    with main._results_lock:
        main._last_results.clear()


def _direct_cost(y, probs, t, cost_fn, cost_fp):
    pred = (probs >= t).astype(int)
    fn = int(((pred == 0) & (y == 1)).sum())
    fp = int(((pred == 1) & (y == 0)).sum())
    return fn * cost_fn + fp * cost_fp


def test_endpoint_404_before_any_run():
    with main._results_lock:
        main._last_results.clear()
    res = TestClient(main.app).get("/threshold-curve")
    assert res.status_code == 404


def test_endpoint_returns_exact_costs(client_with_oof):
    client, y, probs = client_with_oof

    res = client.get("/threshold-curve", params={"cost_fn": 10000, "cost_fp": 500})
    assert res.status_code == 200
    body = res.json()

    assert body["source"] == "validation_oof"
    assert body["cost_fn"] == 10000 and body["cost_fp"] == 500
    assert len(body["curve"]) == 99

    for point in body["curve"]:
        assert point["cost"] == _direct_cost(y, probs, point["threshold"], 10000, 500)
        assert point["cost"] == point["fn"] * 10000 + point["fp"] * 500


def test_costs_from_the_client_change_the_curve(client_with_oof):
    """The exact regression the dashboard had: costs never reached the backend."""
    client, y, probs = client_with_oof

    cheap = client.get("/threshold-curve", params={"cost_fn": 10000, "cost_fp": 500}).json()
    fn_heavy = client.get("/threshold-curve", params={"cost_fn": 80000, "cost_fp": 500}).json()

    assert [p["cost"] for p in cheap["curve"]] != [p["cost"] for p in fn_heavy["curve"]]

    # And the recomputation is honest for the new costs too.
    for point in fn_heavy["curve"]:
        assert point["cost"] == _direct_cost(y, probs, point["threshold"], 80000, 500)

    # Heavier miss penalty => flag more aggressively (never a higher threshold).
    assert fn_heavy["optimal"]["threshold"] <= cheap["optimal"]["threshold"]


def test_endpoint_defaults_to_the_runs_costs(client_with_oof):
    client, _, _ = client_with_oof
    body = client.get("/threshold-curve").json()
    assert body["cost_fn"] == 10000
    assert body["cost_fp"] == 500


def test_endpoint_rejects_non_positive_costs(client_with_oof):
    client, _, _ = client_with_oof
    assert client.get("/threshold-curve", params={"cost_fn": 0}).status_code == 422
    assert client.get("/threshold-curve", params={"cost_fp": -5}).status_code == 422

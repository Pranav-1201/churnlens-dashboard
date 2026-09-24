"""Phase 6.3 — GET /health surfaces artifact age and git commit.

health() does `from churn_intel.artifacts import load_artifact` inside the
function body (a fresh lookup each call), so monkeypatching the attribute
on the churn_intel.artifacts module object is picked up without needing to
touch main's own namespace or reload anything.
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import main
from churn_intel import artifacts


@pytest.fixture
def client():
    return TestClient(main.app)


def test_health_reports_artifact_commit_and_age(client, monkeypatch):
    trained_at = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    fake_meta = {
        "model_name": "CatBoost",
        "feature_names": ["a", "b"],
        "git_commit": "deadbee",
        "trained_at": trained_at,
    }

    def fake_load_artifact():
        return object(), 0.5, fake_meta

    monkeypatch.setattr(artifacts, "load_artifact", fake_load_artifact)
    body = client.get("/health").json()

    assert body["artifact_git_commit"] == "deadbee"
    assert body["artifact_trained_at"] == trained_at
    assert body["artifact_age_seconds"] == pytest.approx(7200, abs=30)
    assert body["model_name"] == "CatBoost"
    assert body["feature_count"] == 2


def test_health_handles_missing_artifact_gracefully(client, monkeypatch):
    def boom():
        raise FileNotFoundError("no artifact")

    monkeypatch.setattr(artifacts, "load_artifact", boom)
    res = client.get("/health")

    assert res.status_code == 200
    body = res.json()
    assert body["model_name"] is None
    assert body["artifact_git_commit"] is None
    assert body["artifact_age_seconds"] is None


def test_health_reports_app_git_commit_key(client):
    # Env-driven at import time; assert presence/consistency, not a forced
    # value (forcing it would need a full module reload for no real gain).
    assert client.get("/health").json()["app_git_commit"] == main.APP_GIT_COMMIT

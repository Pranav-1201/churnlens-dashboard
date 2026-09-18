"""Phase 4 — CORS, error hygiene, and the /results status-code contract.

Guards:
- 4.1: CORS never combines a wildcard origin with credentials.
- 4.4: a failed pipeline run never leaks a traceback/file path to the client;
  /results for an incomplete job is a normal (non-exception) response.
"""
import pandas as pd
import pytest
from fastapi.testclient import TestClient

import main
from churn_intel import jobs, pipeline


@pytest.fixture(autouse=True)
def isolated_store():
    saved = dict(jobs._store)
    jobs._store.clear()
    yield
    jobs._store.clear()
    jobs._store.update(saved)


@pytest.fixture
def client():
    return TestClient(main.app)


# ── 4.1 CORS ─────────────────────────────────────────────────────────────────

def test_cors_never_combines_wildcard_with_credentials():
    cors = next(
        m for m in main.app.user_middleware
        if m.cls.__name__ == "CORSMiddleware"
    )
    origins = cors.kwargs.get("allow_origins", [])
    assert "*" not in origins, "wildcard origin + allow_credentials is invalid per the fetch spec"


def test_cors_allowed_origin_is_echoed(client):
    res = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_disallowed_origin_gets_no_cors_header(client):
    res = client.options(
        "/health",
        headers={
            "Origin": "http://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" not in res.headers


# ── 4.4 error hygiene ────────────────────────────────────────────────────────

def test_failed_job_error_has_no_traceback_or_file_path(client, monkeypatch):
    """Exercise the REAL churn_intel.pipeline.run_pipeline error path (not a
    stub), since the leak lives in its except-clause message formatting."""
    def boom(df):
        raise ValueError("bad row at index 3")

    monkeypatch.setattr(pipeline, "derive_costs", boom)

    job_id = jobs.create_job()
    main._run_pipeline_job(job_id, df=pd.DataFrame({"a": [1]}))
    status = client.get(f"/pipeline-status/{job_id}").json()

    assert status["status"] == "failed"
    assert "Traceback" not in status["error"]
    assert "churn_intel" not in status["error"]
    assert ".py" not in status["error"]


def test_results_for_incomplete_job_is_not_raised_as_an_error(client):
    job_id = jobs.create_job()
    res = client.get(f"/results/{job_id}")

    # 202 = accepted/processing, not an error; the client must be able to
    # read it as a normal body rather than catching it as a failed fetch.
    assert res.status_code == 202
    body = res.json()
    assert body["status"] == "queued"

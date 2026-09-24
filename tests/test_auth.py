"""Phase 6.2 — API-key auth on /run-pipeline and /upload.

CHURNLENS_API_KEY unset: both endpoints stay open (dev-friendly default).
Set: both require a matching X-API-Key header, or 401 — checked without
triggering the real pipeline/CSV-parsing logic, so these assert on the
dependency alone, not on what the route body does afterward.
"""
import io

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def client():
    return TestClient(main.app)


def _tiny_csv():
    return io.BytesIO(b"a,b\n1,2\n")


# ── auth disabled (no key configured) ───────────────────────────────────────

def test_upload_open_when_no_api_key_configured(client, monkeypatch):
    monkeypatch.delenv("CHURNLENS_API_KEY", raising=False)
    res = client.post("/upload", files={"file": ("t.csv", _tiny_csv(), "text/csv")})
    assert res.status_code == 200


def test_run_pipeline_open_when_no_api_key_configured(client, monkeypatch):
    monkeypatch.delenv("CHURNLENS_API_KEY", raising=False)
    res = client.post("/run-pipeline")  # no file, no use_demo
    # Reaches the route body's own validation (not blocked by auth).
    assert res.status_code == 400
    assert "Provide file or use_demo" in res.json()["detail"]


# ── auth enabled (key configured) ───────────────────────────────────────────

def test_upload_rejects_missing_key(client, monkeypatch):
    monkeypatch.setenv("CHURNLENS_API_KEY", "secret123")
    res = client.post("/upload", files={"file": ("t.csv", _tiny_csv(), "text/csv")})
    assert res.status_code == 401


def test_upload_rejects_wrong_key(client, monkeypatch):
    monkeypatch.setenv("CHURNLENS_API_KEY", "secret123")
    res = client.post(
        "/upload",
        files={"file": ("t.csv", _tiny_csv(), "text/csv")},
        headers={"X-API-Key": "wrong"},
    )
    assert res.status_code == 401


def test_upload_accepts_correct_key(client, monkeypatch):
    monkeypatch.setenv("CHURNLENS_API_KEY", "secret123")
    res = client.post(
        "/upload",
        files={"file": ("t.csv", _tiny_csv(), "text/csv")},
        headers={"X-API-Key": "secret123"},
    )
    assert res.status_code == 200


def test_run_pipeline_rejects_missing_key(client, monkeypatch):
    monkeypatch.setenv("CHURNLENS_API_KEY", "secret123")
    res = client.post("/run-pipeline")
    assert res.status_code == 401


def test_run_pipeline_accepts_correct_key_and_reaches_route_body(client, monkeypatch):
    monkeypatch.setenv("CHURNLENS_API_KEY", "secret123")
    res = client.post("/run-pipeline", headers={"X-API-Key": "secret123"})
    # Passed auth; 400 comes from the route body's own "provide file or
    # use_demo" check, proving the dependency let it through.
    assert res.status_code == 400
    assert "Provide file or use_demo" in res.json()["detail"]


# ── unprotected endpoints stay open regardless ──────────────────────────────

def test_health_never_requires_api_key(client, monkeypatch):
    monkeypatch.setenv("CHURNLENS_API_KEY", "secret123")
    res = client.get("/health")
    assert res.status_code == 200

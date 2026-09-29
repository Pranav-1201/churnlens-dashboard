"""Phase B (deploy blockers): production mode, CORS from env, honest health, API hardening.

Each test names the defect it guards (roadmap ids B1..B10). Settings are read from the
environment on every call (like churn_intel.auth), so monkeypatching os.environ is enough.
"""
import io

import pytest
from fastapi.testclient import TestClient

import main
from churn_intel import artifacts, settings


@pytest.fixture
def client():
    return TestClient(main.app)


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for name in ("CHURNLENS_ENV", "CHURNLENS_READ_ONLY", "CHURNLENS_API_KEY",
                 "CORS_ORIGINS", "CHURNLENS_MAX_UPLOAD_BYTES"):
        monkeypatch.delenv(name, raising=False)


def _csv(n_bytes=8):
    return io.BytesIO(b"a" * n_bytes)


# ── B1: CORS origins come from the environment ────────────────────────────────

def test_default_cors_origins_include_dev_and_compose_frontends():
    origins = settings.cors_origins()
    assert "http://localhost:5173" in origins
    assert "http://localhost:8080" in origins  # docker-compose frontend


def test_cors_origins_read_from_env(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com, https://b.example.com")
    assert settings.cors_origins() == ["https://app.example.com", "https://b.example.com"]


def test_cors_middleware_is_configured_from_the_settings():
    from fastapi.middleware.cors import CORSMiddleware

    cors = next(m for m in main.app.user_middleware if m.cls is CORSMiddleware)
    assert "http://localhost:8080" in cors.kwargs["allow_origins"]


def test_cors_wildcard_is_rejected(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "*")
    with pytest.raises(ValueError):
        settings.cors_origins()


# ── B3: read-only mode (default in production) ────────────────────────────────

def test_read_only_defaults_off_in_dev_and_on_in_production(monkeypatch):
    assert settings.read_only() is False
    monkeypatch.setenv("CHURNLENS_ENV", "production")
    assert settings.read_only() is True


def test_read_only_can_be_overridden_explicitly(monkeypatch):
    monkeypatch.setenv("CHURNLENS_ENV", "production")
    monkeypatch.setenv("CHURNLENS_READ_ONLY", "0")
    assert settings.read_only() is False


def test_write_routes_are_forbidden_in_read_only_mode(client, monkeypatch):
    monkeypatch.setenv("CHURNLENS_READ_ONLY", "1")
    assert client.post("/run-pipeline").status_code == 403
    res = client.post("/upload", files={"file": ("t.csv", _csv(), "text/csv")})
    assert res.status_code == 403


def test_read_only_mode_still_serves_predictions(client, monkeypatch):
    monkeypatch.setenv("CHURNLENS_READ_ONLY", "1")
    assert client.post("/predict", json={}).status_code == 200


# ── B2: fail closed in production ─────────────────────────────────────────────

def test_production_write_route_without_key_is_refused(client, monkeypatch):
    monkeypatch.setenv("CHURNLENS_ENV", "production")
    monkeypatch.setenv("CHURNLENS_READ_ONLY", "0")  # writable, but no key configured
    res = client.post("/upload", files={"file": ("t.csv", _csv(), "text/csv")})
    assert res.status_code == 503


def test_production_write_route_with_key_works(client, monkeypatch):
    monkeypatch.setenv("CHURNLENS_ENV", "production")
    monkeypatch.setenv("CHURNLENS_READ_ONLY", "0")
    monkeypatch.setenv("CHURNLENS_API_KEY", "k")
    res = client.post("/upload", files={"file": ("t.csv", _csv(), "text/csv")},
                      headers={"X-API-Key": "k"})
    assert res.status_code == 200


# ── B8: upload size cap ───────────────────────────────────────────────────────

def test_upload_over_the_cap_is_rejected_with_413(client, monkeypatch):
    monkeypatch.setenv("CHURNLENS_MAX_UPLOAD_BYTES", "10")
    res = client.post("/upload", files={"file": ("t.csv", _csv(50), "text/csv")})
    assert res.status_code == 413


def test_run_pipeline_upload_over_the_cap_is_rejected_with_413(client, monkeypatch):
    monkeypatch.setenv("CHURNLENS_MAX_UPLOAD_BYTES", "10")
    res = client.post("/run-pipeline", files={"file": ("t.csv", _csv(50), "text/csv")})
    assert res.status_code == 413


def test_upload_under_the_cap_still_works(client, monkeypatch):
    monkeypatch.setenv("CHURNLENS_MAX_UPLOAD_BYTES", "1000")
    res = client.post("/upload", files={"file": ("t.csv", io.BytesIO(b"a,b\n1,2\n"), "text/csv")})
    assert res.status_code == 200


# ── B5: honest health ─────────────────────────────────────────────────────────

def test_health_is_503_when_the_artifact_cannot_load(client, monkeypatch):
    def boom():
        raise FileNotFoundError("churn_model.pkl not found")

    monkeypatch.setattr(artifacts, "load_artifact", boom)
    res = client.get("/health")
    assert res.status_code == 503
    assert res.json()["status"] != "ok"


def test_livez_stays_up_without_the_artifact(client, monkeypatch):
    monkeypatch.setattr(artifacts, "load_artifact", lambda: (_ for _ in ()).throw(RuntimeError("x")))
    assert client.get("/livez").status_code == 200


# ── B6: /metrics with no data is a bodiless 204 ───────────────────────────────

def test_metrics_without_a_run_returns_bodiless_204(client, monkeypatch):
    monkeypatch.setattr(main, "_last_results", {})
    res = client.get("/metrics")
    assert res.status_code == 204
    assert res.content == b""


# ── B7: bounded query parameters and shap index ───────────────────────────────

def test_threshold_curve_rejects_absurd_costs_with_422(client):
    res = client.get("/threshold-curve", params={"cost_fn": "1e308", "cost_fp": "1"})
    assert res.status_code == 422


def test_cost_sensitivity_rejects_absurd_fp_cost_with_422(client):
    res = client.get("/cost-sensitivity", params={"cost_fp": "1e308"})
    assert res.status_code == 422


def test_shap_negative_index_is_404(client, monkeypatch):
    monkeypatch.setattr(main, "_last_results", {"customer_shap": [{"i": 0}, {"i": 1}]})
    assert client.get("/shap/-1").status_code == 404
    assert client.get("/shap/1").status_code == 200


# ── B10: API docs hidden in production ────────────────────────────────────────

def test_docs_enabled_only_outside_production(monkeypatch):
    assert settings.docs_enabled() is True
    monkeypatch.setenv("CHURNLENS_ENV", "production")
    assert settings.docs_enabled() is False


# ── B4: results snapshot fallback ─────────────────────────────────────────────

def test_snapshot_is_loaded_when_no_last_run_exists(tmp_path, monkeypatch):
    snap = tmp_path / "results_snapshot.json"
    snap.write_text('{"best_model": "CatBoost", "best_threshold": 0.07}', encoding="utf-8")
    monkeypatch.setattr(main, "_LAST_RUN_PATH", str(tmp_path / "missing_last_run.json"))
    monkeypatch.setattr(main, "_SNAPSHOT_PATH", str(snap))
    monkeypatch.setattr(main, "_last_results", {})
    main._load_last_results()
    assert main._last_results["best_model"] == "CatBoost"


def test_last_run_takes_precedence_over_the_snapshot(tmp_path, monkeypatch):
    last = tmp_path / "last_run.json"
    last.write_text('{"best_model": "LightGBM"}', encoding="utf-8")
    snap = tmp_path / "results_snapshot.json"
    snap.write_text('{"best_model": "CatBoost"}', encoding="utf-8")
    monkeypatch.setattr(main, "_LAST_RUN_PATH", str(last))
    monkeypatch.setattr(main, "_SNAPSHOT_PATH", str(snap))
    monkeypatch.setattr(main, "_last_results", {})
    main._load_last_results()
    assert main._last_results["best_model"] == "LightGBM"


def test_nothing_is_persisted_in_read_only_mode(tmp_path, monkeypatch):
    target = tmp_path / "last_run.json"
    monkeypatch.setattr(main, "_LAST_RUN_PATH", str(target))
    monkeypatch.setenv("CHURNLENS_READ_ONLY", "1")
    main._persist_last_results({"best_model": "x"})
    assert not target.exists()

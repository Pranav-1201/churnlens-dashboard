"""
main.py — FINAL MERGED VERSION (Claude + Your Stable Code)

Features:
- Async pipeline execution
- Job tracking
- SHAP (single + global)
- EDA
- Metrics from pipeline
- File upload support
- Stable /predict endpoint (unchanged logic)
"""

import io
import json
import logging
import os
import threading
import time
import traceback
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import sklearn

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from churn_intel import jobs as job_store
from churn_intel.auth import require_api_key
from churn_intel.config import DEMO_CSV_PATH
from churn_intel.costs import cost_sensitivity_curve, cost_threshold_curve
from churn_intel.inference import predict as run_predict
from churn_intel.pipeline import run_pipeline
from churn_intel.schemas import CustomerInput, PredictionResponse, validate_training_frame

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("churnlens.api")

# App build identity: baked in at image build time (see backend/Dockerfile
# and the CI docker job); "unknown" for a bare `uvicorn main:app` dev run.
APP_GIT_COMMIT = os.environ.get("GIT_SHA", "unknown")

if not os.environ.get("CHURNLENS_API_KEY"):
    logger.warning(
        "CHURNLENS_API_KEY is not set -- /run-pipeline and /upload are "
        "UNAUTHENTICATED. Set CHURNLENS_API_KEY before deploying anywhere "
        "reachable outside localhost (Phase 6.2)."
    )

# ──────────────────────────────────────────────
# App setup
# ──────────────────────────────────────────────
app = FastAPI(title="ChurnLens API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────
# Request logging (Phase 6.3)
# ──────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - start) * 1000
    logger.info(
        "%s %s -> %d (%.1fms)",
        request.method, request.url.path, response.status_code, duration_ms,
    )
    return response

# Paths: DEMO_CSV_PATH comes from config.yaml, resolved relative to the config
# file rather than hardcoded to one machine's drive layout.

# Cache last pipeline results
_last_results: dict = {}
_results_lock = threading.Lock()

# Warm start: persist the most recent run so the dashboard survives a restart
# instead of dropping every result when the process exits (AUDIT.md §4.G).
_LAST_RUN_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                              "..", "models", "last_run.json")


def _persist_last_results(results: dict) -> None:
    try:
        os.makedirs(os.path.dirname(_LAST_RUN_PATH), exist_ok=True)
        with open(_LAST_RUN_PATH, "w", encoding="utf-8") as f:
            json.dump(results, f, default=str)
    except Exception as e:  # persistence is best-effort; never break a run over it
        logger.warning("warm-start: could not persist last run: %s", e)


def _load_last_results() -> None:
    global _last_results
    try:
        if os.path.exists(_LAST_RUN_PATH):
            with open(_LAST_RUN_PATH, "r", encoding="utf-8") as f:
                _last_results = json.load(f)
            logger.info("warm-start: loaded previous run from %s (model=%s)",
                        _LAST_RUN_PATH, _last_results.get("best_model"))
    except Exception as e:
        logger.warning("warm-start: could not load previous run: %s", e)


_load_last_results()


# ──────────────────────────────────────────────
# Background pipeline runner
# ──────────────────────────────────────────────
def _run_pipeline_job(job_id: str, df: pd.DataFrame):
    global _last_results

    def progress_cb(pct: int, msg: str):
        job_store.update_progress(job_id, pct, msg)

    try:
        results = run_pipeline(df, progress_callback=progress_cb)
        with _results_lock:
            _last_results = results
        _persist_last_results(results)
        job_store.mark_complete(job_id, results)
    except Exception as e:
        tb = traceback.format_exc()
        job_store.mark_failed(job_id, str(e))
        logger.error("Job %s failed:\n%s", job_id, tb)


# ──────────────────────────────────────────────
# Health
# ──────────────────────────────────────────────
@app.get("/health")
def health():
    try:
        from churn_intel.artifacts import load_artifact
        _, _, meta = load_artifact()
        feature_count = len(meta.get("feature_names", []))
        model_name = meta.get("model_name")
        artifact_git_commit = meta.get("git_commit")
        trained_at = meta.get("trained_at")
        artifact_age_seconds = None
        if trained_at:
            try:
                trained_dt = datetime.fromisoformat(trained_at)
                if trained_dt.tzinfo is None:
                    trained_dt = trained_dt.replace(tzinfo=timezone.utc)
                artifact_age_seconds = (
                    datetime.now(timezone.utc) - trained_dt
                ).total_seconds()
            except ValueError:
                pass  # unparseable trained_at is reported as null, not a 500
    except Exception:
        feature_count, model_name = 0, None
        artifact_git_commit, trained_at, artifact_age_seconds = None, None, None
    return {
        "status": "ok",
        "sklearn_version": sklearn.__version__,
        "python": sys.version.split()[0],
        "feature_count": feature_count,
        "model_name": model_name,
        "app_git_commit": APP_GIT_COMMIT,
        "artifact_git_commit": artifact_git_commit,
        "artifact_trained_at": trained_at,
        "artifact_age_seconds": artifact_age_seconds,
    }


# ──────────────────────────────────────────────
# RUN PIPELINE
# ──────────────────────────────────────────────
@app.post("/run-pipeline", dependencies=[Depends(require_api_key)])
async def run_pipeline_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(None),
    use_demo: bool = Form(False),
):
    if use_demo:
        if not os.path.exists(DEMO_CSV_PATH):
            raise HTTPException(404, "Demo dataset not found")
        df = pd.read_csv(DEMO_CSV_PATH)

    elif file is not None:
        contents = await file.read()
        try:
            df = pd.read_csv(io.BytesIO(contents))
        except Exception as e:
            raise HTTPException(400, f"CSV parse error: {e}")

    else:
        raise HTTPException(400, "Provide file or use_demo=true")

    # Schema validation for the uploaded/demo training CSV (Phase 3, item 6)
    try:
        validate_training_frame(df)
    except ValueError as e:
        raise HTTPException(422, str(e))

    job_id = job_store.create_job()
    background_tasks.add_task(_run_pipeline_job, job_id, df)

    return {"job_id": job_id, "status": "queued"}


# ──────────────────────────────────────────────
# PIPELINE STATUS
# ──────────────────────────────────────────────
@app.get("/pipeline-status/{job_id}")
def pipeline_status(job_id: str):
    status = job_store.get_status(job_id)
    if status is None:
        raise HTTPException(404, "Job not found")
    return status


# ──────────────────────────────────────────────
# RESULTS
# ──────────────────────────────────────────────
@app.get("/results/{job_id}")
def get_results(job_id: str):
    status = job_store.get_status(job_id)

    if status is None:
        raise HTTPException(404, "Job not found")

    if status["status"] != "complete":
        # 202 = accepted/processing, not an error; a normal response (not an
        # HTTPException) keeps that semantic honest for the client.
        return JSONResponse(
            {"status": status["status"], "detail": "Job not complete"},
            status_code=202,
        )

    results = job_store.get_results(job_id)
    if results is None:
        raise HTTPException(500, "Results missing")

    return results


# ──────────────────────────────────────────────
# METRICS
# ──────────────────────────────────────────────
@app.get("/metrics")
def metrics():
    with _results_lock:
        if not _last_results:
            return JSONResponse(status_code=204, content={"detail": "Run pipeline first"})

        return {
            "models": _last_results.get("models", []),
            "best_model": _last_results.get("best_model"),
            "best_threshold": _last_results.get("best_threshold"),
            "cost_fn": _last_results.get("cost_fn"),
            "cost_fp": _last_results.get("cost_fp"),
            "cost_derivation": _last_results.get("cost_derivation"),
        }


# ──────────────────────────────────────────────
# THRESHOLD CURVE — real cost-vs-threshold from OOF predictions
# Recomputed live with the caller's FN/FP costs (no retraining).
# This is the honest replacement for the old fabricated frontend curve.
# ──────────────────────────────────────────────
@app.get("/threshold-curve")
def threshold_curve(
    cost_fn: float = Query(None, gt=0, description="Cost of a missed churner (false negative)"),
    cost_fp: float = Query(None, gt=0, description="Cost of a wasted offer (false positive)"),
):
    with _results_lock:
        oof = _last_results.get("validation_oof")
        default_fn = _last_results.get("cost_fn", 10000)
        default_fp = _last_results.get("cost_fp", 500)
        best_model = _last_results.get("best_model")
        locked_threshold = _last_results.get("best_threshold")

    if not oof:
        raise HTTPException(404, "Run the pipeline first")

    fn = float(cost_fn) if cost_fn is not None else float(default_fn)
    fp = float(cost_fp) if cost_fp is not None else float(default_fp)

    y_true = np.asarray(oof["y_true"], dtype=int)
    probs = np.asarray(oof["probs"], dtype=float)
    curve = cost_threshold_curve(y_true, probs, fn, fp)
    optimal = min(curve, key=lambda r: r["cost"])

    return {
        "source": "validation_oof",
        "model": oof.get("model", best_model),
        "cost_fn": fn,
        "cost_fp": fp,
        "curve": curve,
        "optimal": optimal,
        "locked_threshold": locked_threshold,
        "note": oof.get("note"),
    }


# ──────────────────────────────────────────────
# COST SENSITIVITY — how the optimal threshold shifts with the FN/FP ratio
# ──────────────────────────────────────────────
@app.get("/cost-sensitivity")
def cost_sensitivity(
    cost_fp: float = Query(None, gt=0, description="Fixed FP cost; FN = ratio * FP"),
):
    with _results_lock:
        oof = _last_results.get("validation_oof")
        default_fp = _last_results.get("cost_fp", 500)
        best_model = _last_results.get("best_model")
        derivation = _last_results.get("cost_derivation")

    if not oof:
        raise HTTPException(404, "Run the pipeline first")

    fp = float(cost_fp) if cost_fp is not None else float(default_fp)
    y_true = np.asarray(oof["y_true"], dtype=int)
    probs = np.asarray(oof["probs"], dtype=float)

    return {
        "source": "validation_oof",
        "model": oof.get("model", best_model),
        "cost_fp": fp,
        "points": cost_sensitivity_curve(y_true, probs, fp),
        "cost_derivation": derivation,
    }


# ──────────────────────────────────────────────
# SHAP (Single)
# ──────────────────────────────────────────────
@app.get("/shap/{index}")
def shap_single(index: int):
    with _results_lock:
        data = _last_results.get("customer_shap", [])

    if not data:
        raise HTTPException(404, "Run pipeline first")

    if index >= len(data):
        raise HTTPException(404, f"Index out of range")

    return data[index]


# ──────────────────────────────────────────────
# SHAP GLOBAL
# ──────────────────────────────────────────────
@app.get("/shap-global")
def shap_global():
    with _results_lock:
        data = _last_results.get("shap_global", [])

    if not data:
        raise HTTPException(404, "Run pipeline first")

    return {"shap_global": data}


# ──────────────────────────────────────────────
# EDA
# ──────────────────────────────────────────────
@app.get("/eda")
def eda():
    with _results_lock:
        data = _last_results.get("eda")

    if not data:
        raise HTTPException(404, "Run pipeline first")

    return data


# ──────────────────────────────────────────────
# UPLOAD (from old file — useful for validation)
# ──────────────────────────────────────────────
@app.post("/upload", dependencies=[Depends(require_api_key)])
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "Only CSV supported")

    contents = await file.read()

    try:
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
    except Exception as e:
        raise HTTPException(400, f"CSV error: {e}")

    return {
        "rows": len(df),
        "columns": len(df.columns),
        "column_names": list(df.columns),
    }


# ──────────────────────────────────────────────
# PREDICT (UNCHANGED — IMPORTANT)
# ──────────────────────────────────────────────
@app.post("/predict", response_model=PredictionResponse)
def predict(request: CustomerInput):
    return run_predict(request.dict())
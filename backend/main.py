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
import os
import threading
import traceback
import sys

import pandas as pd
import sklearn

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import job_store
from pipeline import run_pipeline
from predictor import predict as run_predict
from schemas import CustomerInput, PredictionResponse

# ──────────────────────────────────────────────
# App setup
# ──────────────────────────────────────────────
app = FastAPI(title="ChurnLens API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
DEMO_CSV_PATH = "D:/MLProject/data/telco_churn.csv"

print("DEBUG PATH:", DEMO_CSV_PATH)
print("FILE EXISTS:", os.path.exists(DEMO_CSV_PATH))

# Cache last pipeline results
_last_results: dict = {}
_results_lock = threading.Lock()

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
        job_store.mark_complete(job_id, results)
    except Exception as e:
        tb = traceback.format_exc()
        job_store.mark_failed(job_id, str(e))
        print(f"[pipeline] Job {job_id} failed:\n{tb}")


# ──────────────────────────────────────────────
# Health
# ──────────────────────────────────────────────
@app.get("/health")
def health():
    try:
        from model_loader import load_artifact
        _, _, meta = load_artifact()
        feature_count = len(meta.get("feature_names", []))
        model_name = meta.get("model_name")
    except Exception:
        feature_count, model_name = 0, None
    return {
        "status": "ok",
        "sklearn_version": sklearn.__version__,
        "python": sys.version.split()[0],
        "feature_count": feature_count,
        "model_name": model_name,
    }


# ──────────────────────────────────────────────
# RUN PIPELINE
# ──────────────────────────────────────────────
@app.post("/run-pipeline")
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

    # Required columns
    required = {"tenure", "MonthlyCharges", "TotalCharges", "Churn"}
    missing = required - set(df.columns)
    if missing:
        raise HTTPException(422, f"Missing columns: {missing}")

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
        raise HTTPException(202, f"Job not complete: {status['status']}")

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
@app.post("/upload")
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
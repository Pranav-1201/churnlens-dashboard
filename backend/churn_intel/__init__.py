"""churn_intel — the ChurnLens backend package.

Split from the former flat backend modules (Phase 3, item 1):

    config    — tunable constants (costs, seed, grids)
    data      — dataset cleaning + EDA summary
    costs     — cost derivation, business cost, threshold/sensitivity curves
    features  — the single canonical raw-row -> model-ready-features path
    modeling  — out-of-fold validation, model zoo, SHAP helpers
    pipeline  — run_pipeline() orchestration
    artifacts — model artifact save/load (pickle I/O)
    inference — single-customer prediction over the serialized artifact
    schemas   — API request/response schemas + training-CSV validation
    jobs      — in-memory async job tracker

The flat modules left in backend/ (features.py, pipeline.py, predictor.py,
model_loader.py, schemas.py, job_store.py) are thin compatibility shims.
backend/features.py in particular MUST remain importable: the serialized
artifact references `features.engineer_features` (see AUDIT.md / HANDOFF.md).
"""

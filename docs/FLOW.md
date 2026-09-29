# ChurnLens — Execution flow (how a request actually travels)

Last verified against the code: 2026-09-29 (commit `8155402b`). Use this to find which files a change touches.

## 1. `POST /predict` (the hot path, ~70 ms warm)

```
client JSON
  -> main.py:predict()                       validates with schemas.CustomerInput (422 on bad enum/range)
  -> inference.predict(request.dict())
       -> artifacts.load_artifact()          first call unpickles models/churn_model.pkl, then cached
       -> pipeline.predict_proba(DataFrame)  Pipeline: engineer_features -> stringify -> CatBoost
       -> risk_level(prob, threshold)        bands derived from the locked threshold
       -> get_shap_values(...)               CatBoost ShapValues; returns None (never fake) on failure
  <- PredictionResponse {probability, prediction, risk_level, threshold_used, shap_values}
```

Note: `probability` is the model's raw score (trained with class weights), not a calibrated churn rate.

## 2. `POST /run-pipeline` (training job, minutes and GBs of RAM)

```
main.py:run_pipeline_endpoint  (X-API-Key checked by auth.require_api_key when CHURNLENS_API_KEY is set)
  -> read CSV (demo file from config.yaml or upload) -> schemas.validate_training_frame (422)
  -> jobs.create_job() -> BackgroundTasks -> main._run_pipeline_job(job_id, df)
       -> pipeline.run_pipeline(df, progress_callback)
            costs.derive_costs -> data.compute_eda_summary -> data.clean_data
            train_test_split (stratified) -> StratifiedKFold OOF per model (modeling._run_model)
            select lowest OOF cost -> evaluate test set ONCE -> SHAP -> results dict
       -> _last_results = results ; models/last_run.json written ; jobs.mark_complete
client polls GET /pipeline-status/{job_id}, then GET /results/{job_id}
```

## 3. Dashboard read path

`/metrics`, `/eda`, `/shap/{i}`, `/shap-global`, `/threshold-curve`, `/cost-sensitivity` all read `_last_results` (module-level dict in `main.py`, loaded from `models/last_run.json` at import). With no previous run they return 404/204 — the dashboard then shows its empty state.

## 4. Offline training

`python backend/train.py` -> `pipeline.run_pipeline(..., artifact_path=...)` -> `artifacts.save_artifact` writes `models/churn_model.pkl` with metadata (`model_name`, `threshold`, `feature_names`, `trained_at`, `git_commit`, `sklearn_version`, `cost_fn`, `cost_fp`, `final_evaluation`).

## 5. Frontend data flow

`src/services/api.ts` (base URL from `VITE_API_URL` / `VITE_API_BASE_URL`, default `http://localhost:8000`) -> `src/stores/pipelineStore.ts` (run state, results) -> hooks in `src/hooks/` -> pages. There is no auth header handling in the frontend yet.

## Where bugs tend to live (gaps between files)

- `features.py` <-> pickled artifact: module/function rename silently breaks loading.
- `pipeline.py` results dict <-> `src/types/api.ts` <-> pages: a renamed key becomes an empty chart.
- `config.yaml` costs <-> README/dashboard numbers: both must be regenerated when costs change.

# ChurnLens — Architecture (the map, not the detail)

Last verified against the code: 2026-09-29 (commit `8155402b`, main). If you change a module boundary, update this file in the same PR.

## Shape of the system

```
Browser (React SPA, Vite build)            FastAPI backend (one process)             Files on disk
-------------------------------            -----------------------------             -------------
src/pages/*  (23 pages, lazy-loaded)  -->  backend/main.py  (HTTP surface)           models/churn_model.pkl   (deployed artifact)
src/services/api.ts (axios + fetch)        backend/churn_intel/  (domain package)     models/last_run.json     (warm start; gitignored)
src/stores/pipelineStore.ts (zustand)                                                 data/telco_churn.csv     (demo dataset)
src/hooks/* (react-query wrappers)                                                    backend/config.yaml      (costs, splits, paths)
```

Two very different workloads share one process:

| Workload | Endpoints | Cost per call | State |
|---|---|---|---|
| **Serve** | `/predict`, `/health`, chart/read endpoints (`/metrics`, `/threshold-curve`, `/cost-sensitivity`, `/shap*`, `/eda`) | tens of ms, ~240 MB resident | reads the pickled artifact and the last pipeline result |
| **Train** | `/run-pipeline` (+ `/pipeline-status`, `/results`), `backend/train.py` | minutes, several GB RAM | in-memory job tracker, writes `models/last_run.json` |

## Backend package `backend/churn_intel/`

| Module | Responsibility |
|---|---|
| `config.py` | Loads `backend/config.yaml` at import; hard-fails on a missing/invalid key (`ConfigError`). |
| `data.py` | `clean_data`, `compute_eda_summary`. |
| `features.py` | The ONE raw-row-to-features path: `engineer_features`, pipeline builders, `risk_level`. The artifact pickles a reference to `churn_intel.features.engineer_features`. |
| `modeling.py` | Out-of-fold (OOF) validation, the model zoo, SHAP helpers. |
| `costs.py` | Cost derivation (CLV formula), cost-vs-threshold and cost-sensitivity curves. |
| `pipeline.py` | `run_pipeline()` orchestration: OOF selection on the training split, test set evaluated once. |
| `artifacts.py` | Save/load/cache the pickled artifact `{pipeline, threshold, metadata}`. |
| `inference.py` | Single-customer prediction and SHAP over the loaded artifact. |
| `schemas.py` | `CustomerInput` (Literal-typed enums), `validate_training_frame`. |
| `jobs.py` | In-memory job tracker (max 50 jobs). |
| `auth.py` | Optional `X-API-Key` dependency (`CHURNLENS_API_KEY`). |

Other backend scripts: `train.py` (produces the artifact), `seed_demo_run.py` (warm-start seeding, fast models only), `export_ann_history.py` (the only `torch` importer), `diagnostics/catboost_thread_check.py`.

## Frontend

23 routed pages under `/dashboard/*` plus `Landing`. Data pages read the last pipeline result through `usePipelineResults`; `useThresholdCurve` / `useCostSensitivity` call the live cost endpoints. `src/data/ann_history.json` and some pages (Optuna, ANN training) are static notebook records — they must say so on screen.

## Deployment artifacts

`backend/Dockerfile` (python:3.11-slim, non-root, `--workers 1`), `Dockerfile.frontend` (Vite build served by Caddy), `docker-compose.yml`, `.github/workflows/ci.yml` (jobs: `test`, `docker`, `catboost-thread-check`, weekly `slow`).

## Invariants worth protecting

1. Model and threshold are chosen on OOF predictions over the training split only; the test set is evaluated once (`pipeline.py` docstring).
2. Training and inference use the same fitted sklearn `Pipeline` — no second encoding path.
3. No chart or number may be synthesized in the browser; if the backend cannot supply it, the page says so.
4. Single worker: job tracker and `last_run.json` are process-local state.
5. Renaming `churn_intel.features.engineer_features` (or its module) requires retraining the artifact.

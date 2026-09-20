# ChurnLens — Session Handoff

Living handoff for a fresh Claude Code session. Last updated 2026-09-21: **Phases 3, 4 and 5 are complete and merged to `main`.** Next is Phase 6 (deployment).

---

## 0. TL;DR

ChurnLens is a full-stack Telco churn app: **FastAPI backend (`backend/`) + React/Vite/shadcn dashboard (`src/`) + Jupyter notebook (`notebooks/`)**. A multi-phase refactor fixed methodological ML bugs (leakage, fabricated charts, hardcoded costs) and is now doing engineering hygiene.

- Phases 1 and 2 merged via PR #1 (`4856d3bb`). **Phases 3 to 5 merged via PR #2** (branch `phase3-restructure`; CI green on `5f154c37`).
- Phase 3: `churn_intel` package, `config.yaml`, broader tests. Phase 4: CORS fix, no traceback leak, honest 202, pandas 3 warnings, `mockData.ts` deleted (`694b3c73`, `6b7d76f4`, `e5acf116`). Phase 5: pinned and split requirements (`63c8eecc`), CI (`711f5b50`), retrained artifact and six flat shims deleted (`d568ae7d`). Also `.env` untracked (`73c2d309`).
- **Suite: 101 passed, 1 deselected** (local 2026-09-20; same count on the CI Ubuntu runner). **churn_intel coverage 73%** (CI).
- **Next: Phase 6** (see section 4). Stop for the user's review before starting it.

**Read first:** `AUDIT.md`, `README.md`, this file. Project memory: `churnlens-project-state.md`. Full deployment roadmap: `E:\Projects and Research papers\ML Project - Customer Churn Prediction Model\Project\IMPROVEMENT_PLAN.md`.

---

## 1. How to run (do this before asserting anything works)

**Use the venv Python** at `D:\MLProject\venv\Scripts\python.exe` (3.11.9). The system Python (`C:\Python313`) lacks the deps and fails at import/collection.

```bash
# Fast suite (the ~13-min train-the-zoo test is marked slow and deselected by default)
venv/Scripts/python.exe -m pytest -q                        # 101 passed, 1 deselected
venv/Scripts/python.exe -m pytest --cov=churn_intel         # adds per-module coverage
venv/Scripts/python.exe -m pytest -m slow                   # the end-to-end train test only

# Backend API, from backend/. Do not leave it running; a prior session had to kill :8000
cd backend && ../venv/Scripts/python.exe -m uvicorn main:app --reload

# Frontend, repo root: Vite dev server on :5173, talks to :8000
npm run dev
```

- Frontend base URL: `http://localhost:8000` (`.env` `VITE_API_BASE_URL`, `src/services/api.ts`, `src/stores/pipelineStore.ts`).
- The `Pandas4Warning`s are fixed (`"str"` added to the `select_dtypes` include lists); `pytest -q` shows none.

---

## 2. Repo layout

**Backend package `backend/churn_intel/`:** `config` (loads `config.yaml`), `data` (`clean_data`, `compute_eda_summary`), `costs` (cost model and curves), `features` (canonical raw-row to features path), `modeling` (OOF, model zoo, SHAP), `pipeline` (`run_pipeline` orchestration), `artifacts` (pickle save/load/cache), `inference` (single-customer predict), `schemas` (pydantic `CustomerInput`, `validate_training_frame`), `jobs` (in-memory job tracker).

**The flat compat shims are gone** (deleted in `d568ae7d`). Import from `churn_intel` directly. `models/churn_model.pkl` now pickles `churn_intel.features.engineer_features`, so renaming that module or function requires retraining (`python backend/train.py`, about 13 minutes, needs several GB of free RAM).

**Config `backend/config.yaml`:** costs, threshold grid, split sizes, random state, demo CSV path. See section 7 for its hard-fail behaviour.

**API:** `backend/main.py`. **Scripts:** `train.py` (produces the artifact), `seed_demo_run.py` (warm-start seeding, fast models only), `export_ann_history.py` (real ANN loss curve; the only `torch` importer).

**Frontend (`src/`):** `pages/*.tsx`, `hooks/`, `services/api.ts`, `stores/pipelineStore.ts`.

**Tests (`tests/`):** `test_artifacts`, `test_config`, `test_cost_model`, `test_data`, `test_encoding_regression`, `test_jobs`, `test_modeling`, `test_predict_api`, `test_schema_validation`, `test_threshold_curve`, `test_threshold_curve_api`. `conftest.py` puts `backend/` on `sys.path`; `pytest.ini` deselects `slow`.

---

## 3. What is done

- **Phase 1, correctness** (`f939907f`): unified sklearn Pipeline artifact; leakage-free model/threshold selection on out-of-fold predictions; test set evaluated once; `/predict` single-row OHE bug fixed by construction.
- **Phase 2, honest charts/costs** (`f258de11`, `48dad903`, `7cd6a97a`): real `cost_threshold_curve()`; frontend sigmoid fabrication deleted; CLV-derived cost matrix and cost-ratio sensitivity; real ANN loss curve.
- **Phase 3 partial** (`ce586966`): logging, lazy `shap`, `requirements.txt` restored, `CustomerInput` tightened with `Literal` enums plus `validate_training_frame()`.
- **Phase 3 item 1** (`f6cef855`): god-module split into `churn_intel`, compat shims kept then (deleted in Phase 5.3).
- **Phase 3 item 4** (`b27bb388`):
  - `churn_intel/config.py` is now `load_config()` plus constants derived at import. Public names unchanged, so no consumer edits were needed.
  - Covers the cost constants and assumptions, `THRESHOLD_GRID` (as start/stop/step, 99 points), `DEFAULT_COST_RATIOS`, `RANDOM_STATE`, `TEST_SIZE`, `VAL_SIZE`, `N_SPLITS`, `DEMO_CSV_PATH`. The 7 model builders' hyperparameters in `modeling.py` were deliberately left inline (user's scoping choice).
  - Removed the hardcoded `D:/MLProject/data/telco_churn.csv` from `main.py`; the path now resolves relative to `config.yaml`.
  - `export_ann_history.py` had two `0.2` split sizes with different meanings; the train/validation one is its own `val_size` key.
  - Declared `pyyaml==6.0.3`, which had been imported only because the dev venv carried it.
  - `tests/test_config.py`: 15 tests, a genuine red then green (watched `ImportError` before writing the loader).
  - Live-verified 2026-09-16: booted uvicorn with `CHURN_CONFIG` pointing at a temp config holding `default_cost_ratios: [1, 7]`, and `/cost-sensitivity` served `[1.0, 7.0]`; restarted on the shipped file, it served all 12 default ratios.
- **pytest-cov** (`23c0e7b4`): `pytest-cov==7.1.0` declared, `.coverage` gitignored.
- **Phase 3 item 7** (`278a89a5`): `test_jobs`, `test_data`, `test_artifacts`, `test_modeling` added; `test_cost_model` extended. Coverage 53% to 72% (artifacts, costs, data, jobs all 100%; modeling 27% to 52%).
  - **Mutation-proven:** 71 single-bug mutants across config, jobs, data, artifacts, modeling and costs; 0 survivors; all 60 new tests (including item 4's 15) observed failing at least once. Four tests that could not fail against their named bug were found and fixed along the way.
  - **Section 8 caveat retired with evidence:** against the real pre-item-6 `CustomerInput` (from `ce586966^`), the 5 bad-categorical tests and the 422 endpoint test fail; the tenure and charge range tests pass, since those limits predate item 6.

---

## 4. Next: Phase 6 (deployment)

Phases 3 to 5 are done and merged; per the working rules, **stop for the user's review before starting Phase 6.** From `IMPROVEMENT_PLAN.md`, one PR per row:

1. **6.1 Containerize:** backend Dockerfile installing from `requirements.txt` (not the dev file), `.dockerignore`, frontend static build served by nginx or Caddy with `VITE_API_BASE_URL` per environment. Verify with a real `docker build` and `/health` from the container (no Docker on this machine; CI can do it).
2. **6.2 Serving decisions:** document exactly one worker (in-memory `jobs` and one `last_run.json`), an API-key header on `/run-pipeline` and `/upload`, and re-test the CatBoost background-thread deadlock on Linux (subprocess fallback if it persists).
3. **6.3 Observability:** request logging middleware; `/health` with artifact age and git commit.
4. **6.4 Docs:** README with architecture and run/deploy steps; mark the notebook exploratory-only.

**Coverage** (CI, 2026-09-20): TOTAL 73%. Remaining gaps are mostly by design: `pipeline.py` and `modeling.py` (OOF loop, SHAP) are exercised only by the slow end-to-end test; `inference.py` SHAP path.

**Mutation-testing method** (used for the item 7 tests): plant one bug per run into a production module, run only that module's tests, restore the original bytes in a `finally` block, then confirm `git diff backend/` is clean. A new test only counts once it has been watched failing.

---

## 5. Candidate improvement areas (VERIFY before acting)

Resolved: CORS wildcard, hardcoded demo path, `mockData.ts`, pandas warnings, traceback leak, unpinned deps, no CI, shims (all Phases 3 to 5).

1. **No auth** on any endpoint; in-memory `jobs` and a single `last_run.json` are not multi-worker safe (Phase 6.2).
2. **Notebook** `notebooks/Cuatomer_Churn_Model.ipynb` (filename typo) may carry stale numbers (Phase 6.4).
3. **Frontend polish:** error/loading/empty states, accessibility, every chart backed by a real fetch.
4. **Lockfile provenance:** `requirements*.txt` were generated offline from the venv's installed metadata, not by `pip-compile`. They install and pass on CI, but re-generate with `piptools compile requirements.in` from a networked machine when convenient. Windows-only pins need a `; sys_platform == "win32"` marker (`pywinpty` and `colorama` have one; a missing marker broke the first two CI runs).

---

## 6. Working rules the user cares about

- **The user runs sessions under an operating constitution.** The live copy is `Desktop\Claude Prompts\Initial claude prompt.txt` (v6.1 as of 2026-09-16). Check its header with `head -2` at session start **and again on resume**. This session was pasted v3.3 and resumed 28 days later against a live v6.1.
- **`git fetch` first, every session** (user's global CLAUDE.md), then `git pull --ff-only` only when the tree is clean.
- **Verification discipline:** watch tests fail before fixing; show real command output with counts; never claim done without fresh evidence; give live before/after numbers.
- **Stop at phase boundaries for review.** No segmentation / confidence scoring / recommender / dashboard redesign without a go-ahead.
- **Cost matters.** Surface the third cost warning as a continue/narrow/split question. Batch tool calls; do not re-read files.
- **Commit/push only when asked.** Stage explicit paths, never `git add -A`. **No AI attribution** in commits or PRs (global CLAUDE.md).

---

## 7. Known gotchas

- **Junk 0-byte files:** a session hook creates a file named after the token following an arrow or greater-than sign in ANY text it sees, including Python return annotations and commit messages. Run `git status --short` after every commit. Delete only after confirming 0 bytes (or reading the content). Ten were deleted this session.
- **`backend/config.yaml` is mandatory.** A missing file, bad YAML, absent key, or wrong type raises `ConfigError` at import, so every entry point (API, tests, scripts) fails loudly. Point `CHURN_CONFIG` at an alternate file to override. Constants bind at import; editing the YAML needs a process restart.
- **Threshold grid rounding:** `THRESHOLD_GRID` is rounded to 2 decimals, which assumes a 0.01 step. A finer step needs that rounding revisited in `churn_intel/config.py`.
- **CatBoost deadlocks** in the FastAPI background thread (fine in the main process), which is why `seed_demo_run.py` seeds with LR/RF/XGB/LGBM only.
- **sklearn `clone()` rejects CatBoostClassifier**, so the OOF loop uses builder callables.
- **Two git remotes** (`origin`, `lovable`) point at the same GitHub repo; Lovable syncs `main`.
- **Untracked and not ours:** `.claude-flow/` (ruflo tooling). The Lovable de-branding edits and the four `notebooks/` outputs were committed by the user in `e8e02f1c`.
- **CI triggers** only on push to `main` and PRs to `main` (plus a weekly `slow` cron); a plain push to another branch runs nothing. Open a PR to get a run.
- **`.env` is untracked and gitignored** (public repo). It only holds `VITE_API_BASE_URL`.
- **Name-grepping `tests/` is not coverage.** It marked `artifacts.py` and `business_cost` untested; coverage.py measured 74% and covered. Use `--cov`.
- **Line endings:** git warns LF to CRLF on commit; harmless.

---

## 8. Caveats

- **Retired 2026-09-16:** item 6's schema tests had only been seen passing. They were run against the real pre-item-6 `CustomerInput` from `ce586966^`: all 5 bad-categorical cases and the 422 endpoint test fail against it. The tenure and charge range tests still pass there, because those limits already existed; they were never item-6 regression tests.
- **Retired 2026-09-20:** the dependency pins were verified in a clean install on the CI Ubuntu runner (101 passed). Provenance caveat: see section 5, item 4.
- **Still open:** `IMPROVEMENT_PLAN.md` 3.4 specified fallback defaults and YAML hyperparameters; the user chose hard-fail and inline hyperparameters instead. The plan file now records that decision.

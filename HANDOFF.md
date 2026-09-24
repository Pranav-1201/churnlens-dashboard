# ChurnLens — Session Handoff

Living handoff for a fresh Claude Code session. Last updated 2026-09-24: **Phases 3, 4, 5 and 6 are complete.** Phase 6 is [PR #3](https://github.com/Pranav-1201/churnlens-dashboard/pull/3) (branch `phase6-deployment`), CI green — awaiting merge (see section 4a).

---

## 0. TL;DR

ChurnLens is a full-stack Telco churn app: **FastAPI backend (`backend/`) + React/Vite/shadcn dashboard (`src/`) + Jupyter notebook (`notebooks/`, exploratory only)**. A multi-phase refactor fixed methodological ML bugs (leakage, fabricated charts, hardcoded costs), did engineering hygiene, and now has a first deployment story.

- Phases 1 and 2 merged via PR #1 (`4856d3bb`). **Phases 3 to 5 merged via PR #2** (`294631b6`, from branch `phase3-restructure`; CI green).
- Phase 3: `churn_intel` package, `config.yaml`, broader tests. Phase 4: CORS fix, no traceback leak, honest 202, pandas 3 warnings, `mockData.ts` deleted. Phase 5: pinned and split requirements, CI, retrained artifact and six flat shims deleted.
- **Phase 6 (this session, branch `phase6-deployment`, commits `3dbba30`/`9146d79`):** backend/frontend Dockerfiles + compose + CI docker-build/smoke-test job; `CHURNLENS_API_KEY` auth on `/run-pipeline`/`/upload`; request-logging middleware; `/health` now reports `app_git_commit`/`artifact_git_commit`/`artifact_trained_at`/`artifact_age_seconds`; a CatBoost-background-thread-deadlock re-test (see section 4a — **not conclusively resolved, read the caveat**); `DEPLOYMENT.md`; notebook marked exploratory. See `DEPLOYMENT.md` for details.
- **Suite: 112 passed, 1 deselected** (local 2026-09-24, Python 3.11.9). Not yet re-measured on CI for Phase 6 (branch unpushed).
- **This machine was reset since the last session** (new Windows install, new user profile) — the venv, node_modules, and Python 3.11 itself were gone and were rebuilt/reinstalled this session; see section 4a.

**Read first:** `AUDIT.md`, `README.md`, `DEPLOYMENT.md`, this file. Project memory: `churnlens-project-state.md`. The external roadmap file (`E:\Projects and Research papers\...\IMPROVEMENT_PLAN.md`) **no longer exists on this machine** (the `E:` drive is gone post-reset) — Phase 6's scope below was carried forward from this file's own section 4, not re-read from that file.

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

## 4. Phase 6 (deployment) — done this session

All four rows from the old plan are done on branch `phase6-deployment` (not yet pushed — see 4a):

1. **6.1 Containerize:** `backend/Dockerfile` (installs from `requirements.txt`, not the dev file; `--workers 1`; non-root), `.dockerignore`, `Dockerfile.frontend` (Vite build served by Caddy, `VITE_API_BASE_URL` as a build ARG), `docker-compose.yml`. Verified via a new CI `docker` job (build both images, smoke-test `/health` and static serving) — **not yet verified on a machine that can run Docker directly** (none available this session either; see 4a).
2. **6.2 Serving decisions:** documented in `DEPLOYMENT.md` §3 (single worker, why). `CHURNLENS_API_KEY` header auth on `/run-pipeline`/`/upload` (`churn_intel/auth.py`, `tests/test_auth.py`, 8 tests). CatBoost background-thread deadlock re-tested (`backend/diagnostics/catboost_thread_check.py` + new CI `catboost-thread-check` job) — **did not reproduce on Windows or on the Linux CI runner** (PR #3, run `36028099260`, 0.2s, `python=3.11.16, platform=linux`); real evidence for the tested repro pattern, not proof the original observation was wrong under real production load — see `DEPLOYMENT.md` §3.
3. **6.3 Observability:** request-logging middleware; `/health` adds `app_git_commit`, `artifact_git_commit`, `artifact_trained_at`, `artifact_age_seconds` (`tests/test_health.py`, 3 tests).
4. **6.4 Docs:** `DEPLOYMENT.md` (new); `README.md` architecture/deploy section; notebook's first cell now states it's exploratory-only.

**Coverage** (CI, 2026-09-20, pre-Phase-6): TOTAL 73%. Remaining gaps are mostly by design: `pipeline.py` and `modeling.py` (OOF loop, SHAP) are exercised only by the slow end-to-end test; `inference.py` SHAP path. Not re-measured for Phase 6's additions (branch unpushed, no CI run yet).

**Mutation-testing method** (used for the item 7 tests): plant one bug per run into a production module, run only that module's tests, restore the original bytes in a `finally` block, then confirm `git diff backend/` is clean. A new test only counts once it has been watched failing.

## 4a. This session's environment rebuild (2026-09-24)

The user reset this laptop; this was the first session back. Before Phase 6:

- `venv/`, `node_modules/`, `__pycache__`, `.pytest_cache`, `.coverage` deleted and rebuilt from scratch (all gitignored, none were source).
- **Python 3.11 was gone** (only 3.10/3.13 installed) — `requirements.txt`'s pins (`contourpy==1.3.3` needs ≥3.11; `pydantic_core==2.16.1` has no cp313 wheel and no Rust toolchain was present to build it) meant only 3.11 works. Installed Python 3.11.9 via `winget install --id Python.Python.3.11` (matches CI's `python-version: "3.11"` and this file's old §1 note) — a real, system-level, but standard and reversible software install.
- Rebuilt venv on 3.11.9: 172 packages, `pip check` clean. `npm install`: 480 packages, clean.
- Verified before starting Phase 6: `pytest -q` → 101 passed, 1 deselected (matched the pre-reset baseline exactly); `npm run test` → 8/8; `npm run build` → clean; backend booted, `/health` returned 200, loaded the existing `models/churn_model.pkl` correctly.
- No Docker, no WSL, no Rust toolchain on this machine (checked, not installed — WSL/Docker Desktop need a reboot and virtualization changes, judged too invasive to do autonomously without asking).
- The external roadmap file on `E:\` no longer exists (that drive is gone) — Phase 6's scope was read from this file's own section 4 instead.
- Pre-existing frontend lint debt noted, not touched (10 errors, mostly `no-explicit-any`) — not new breakage, out of scope for this session's ask.
- Local `main` was 16 commits behind `origin/main` (which already had PR #2 merged) — fast-forwarded before branching `phase6-deployment` off it.

**Pushed and PR'd** (with explicit go-ahead — per this file's own §6 working rule, "commit/push only when asked"): [PR #3](https://github.com/Pranav-1201/churnlens-dashboard/pull/3), branch `phase6-deployment` → `main`. First real CI run of the new jobs, all green: `test` (3m9s), `docker` (1m34s — both images build, `/health` responds with a real `app_git_commit`, frontend serves its static build), `catboost-thread-check` (49s, see section 4 item 2 for the actual output line). Awaiting merge.

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

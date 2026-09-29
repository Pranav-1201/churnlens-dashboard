# Test checklist — what "done" means (proof, not claims)

Run from the repo root. Baselines measured 2026-09-29 on Windows, Python 3.11.9, Node 24, commit `8155402b`. A change is not done until each relevant line below is run **in that session** and the output is quoted. Read the COUNT, not just the exit code.

| # | Check | Command | Expected (baseline) |
|---|---|---|---|
| 1 | Backend tests + coverage | `venv\Scripts\python.exe -m pytest --cov=churn_intel` | `112 passed, 1 deselected` (~3 min); TOTAL coverage 73% (pipeline.py 20%, modeling.py 52%) — must not fall |
| 2 | Frontend tests | `npm run test` | `Test Files 3 passed (3)`, `Tests 8 passed (8)` (React `act()` warnings on stderr are known) |
| 3 | Type check compiled real files | `npx tsc -p tsconfig.app.json --noEmit --listFiles` | exit 0, and the list holds ~98 first-party files (a solution-style root `tsc` with `files: []` compiles nothing) |
| 4 | Lint (first-party only) | `npx eslint src` | baseline 9 errors, 7 warnings across 97 files — must not increase. (`npm run lint` at the root also lints `venv/` until eslint ignores it: ignore its numbers.) |
| 5 | Production build | `npm run build` | `built in ~22s`; main chunk ~507 kB (warning is known) |
| 6 | API boots and serves | `cd backend` then `..\venv\Scripts\python.exe -m uvicorn main:app --port 8765` ; `curl http://127.0.0.1:8765/health` | `"status":"ok"`, `"model_name":"CatBoost"`, `"feature_count":27` |
| 7 | Prediction is deterministic | `curl -X POST http://127.0.0.1:8765/predict -H "Content-Type: application/json" -d "{}"` | `probability` 0.8795, `prediction` 1, `threshold_used` 0.07 (changes only when the artifact is retrained) |
| 8 | Bad input is rejected | same call with `{"Contract":"Weekly"}` and `{"tenure":-1}` | HTTP 422 both |
| 9 | CI green | `gh pr checks <n>` / `gh run list --branch main` | `test`, `docker`, `catboost-thread-check` = success; `slow` skipped (weekly cron only) |
| 10 | Tree clean | `git status --short` | only the known untracked `.claude-flow/` and `.claude/settings.local.json` |

## Before any public deploy (also run)
- Browser origin check: an `OPTIONS /predict` with `Origin: <the deployed frontend origin>` must return an `access-control-allow-origin` header for that origin.
- `/health` must fail (non-200) when the artifact cannot be loaded.
- No page shows a number that is hard-coded rather than fetched (grep for literals; compare with `/health` and `/metrics`).
- Stop every server you start (find it by command line and PID, never by image name) and confirm the port is free.

## Guard-test rule
A red guard test means the change is wrong, not the test. Watch a new test FAIL against the bug it names before trusting it.

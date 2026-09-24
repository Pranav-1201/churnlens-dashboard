# ChurnLens — Deployment (Phase 6)

Companion to `README.md` (what the project is) and `HANDOFF.md` (session
history). This covers containerization, serving constraints, and
observability added in Phase 6.

---

## 1. Architecture

```
+------------------+      HTTP (JSON)      +------------------------+
|  Frontend        | ---------------------> |  Backend               |
|  React/Vite/     | <---------------------- |  FastAPI (uvicorn)     |
|  shadcn, served  |                        |  churn_intel package   |
|  by Caddy (SPA)  |                        |  1 worker, in-process  |
+------------------+                        |  job tracker           |
                                             +-----------+------------+
                                                         | pickle
                                                         v
                                             models/churn_model.pkl
                                             (sklearn Pipeline + threshold
                                              + metadata, from train.py)
```

The notebook (notebooks/Cuatomer_Churn_Model.ipynb) is exploratory only
(marked as such in its first cell, Phase 6.4) -- it is not run in
production and is not guaranteed to match the deployed artifact.

---

## 2. Running with Docker

Both services, from the repo root:

    docker compose up --build

Backend: http://localhost:8000 (docs at /docs). Frontend: http://localhost:8080

Or individually:

    docker build -f backend/Dockerfile --build-arg GIT_SHA=$(git rev-parse --short HEAD) -t churnlens-backend .
    docker run -p 8000:8000 -e CHURNLENS_API_KEY=change-me churnlens-backend

    docker build -f Dockerfile.frontend --build-arg VITE_API_BASE_URL=https://api.example.com -t churnlens-frontend .
    docker run -p 8080:80 churnlens-frontend

**No Docker was available on the machine this was built on** -- the images
were written by hand against the pinned requirements.txt and verified via
a new CI job (.github/workflows/ci.yml, "docker" job: builds both images,
smoke-tests /health and asserts app_git_commit was actually baked in,
smoke-tests the frontend's static serving). That CI run is the first real
build+boot evidence for these images -- check its status before trusting
them in a real deploy.

VITE_API_BASE_URL is a Vite build-time env var (baked into the JS bundle
via import.meta.env -- see src/services/api.ts), so it's a Docker build
ARG, not a runtime one: rebuild the frontend image per environment, don't
just re-run it with a different -e.

---

## 3. Serving decisions (Phase 6.2)

**Single worker, by design.** backend/Dockerfile's CMD pins --workers 1.
Two pieces of state are in-process/single-file and are NOT safe to split
across multiple workers or replicas without real work:

- churn_intel.jobs -- the /run-pipeline job tracker is an in-memory dict.
  A second worker (or a restart mid-run) loses visibility into jobs the
  other process created.
- models/last_run.json -- the warm-start file main.py reads/writes is a
  single file with no locking beyond a threading.Lock (which only
  protects against races within one process).

Scaling this beyond one process needs a real job queue (Redis/Celery,
Postgres-backed job table, etc.) and moving last_run.json into shared
storage -- out of scope for this phase; noted here so it isn't scaled
naively later.

**API-key auth.** CHURNLENS_API_KEY env var, unset by default (open --
convenient for local dev and the existing test suite, which never sets
it). Set it in any deployment reachable outside localhost; main.py logs a
warning at startup if it's missing. When set, /run-pipeline and /upload
require a matching X-API-Key header or return 401 (see
backend/churn_intel/auth.py, tests/test_auth.py). /predict, /health, and
the read-only chart endpoints are intentionally left open -- they don't
mutate state or cost meaningful compute per call.

**CatBoost background-thread deadlock -- re-tested, not conclusively
resolved.** backend/seed_demo_run.py's docstring records that CatBoost
hangs when trained inside FastAPI's background-task thread on the Windows
dev machine, which is why that script skips it. This phase added
backend/diagnostics/catboost_thread_check.py, which reproduces the real
dispatch path (an actual FastAPI app, BackgroundTasks, 6 sequential
CatBoostClassifier.fit() calls matching oof_probabilities' 5-fold-OOF +
final-fit pattern) with a faulthandler watchdog so a hang produces thread
dumps instead of a silent timeout.

Run locally on this Windows machine, it did NOT hang -- which contradicts
the plain reading of the original observation. Possible explanations not
yet distinguished: the original hang needed the real Telco dataset's
size/shape, concurrent load (multiple simultaneous requests), or a
different CatBoost version than the currently pinned 1.2.10. A new CI job
(catboost-thread-check) runs the same script on Ubuntu, the actual deploy
target -- check that job's result before concluding either way; this
document does not claim the deadlock is fixed or absent on Linux, only
that the check now exists and runs there. If it still deadlocks on Linux,
the documented fallback is running CatBoost training in a subprocess
instead of a thread.

---

## 4. Observability (Phase 6.3)

- Request logging: every request logs "METHOD path -> status (Nms)" (see
  the log_requests middleware in main.py).
- GET /health now reports, in addition to the existing
  status/sklearn_version/python/feature_count/model_name:
  - app_git_commit -- the commit the running image was built from
    (GIT_SHA build arg; "unknown" for a bare "uvicorn main:app" dev run
    without it set).
  - artifact_git_commit, artifact_trained_at -- from the loaded artifact's
    metadata (already produced by train.py).
  - artifact_age_seconds -- computed from artifact_trained_at; null if no
    artifact is loaded or trained_at is missing/unparseable.

---

## 5. Still open (not done in this phase)

- Docker build/boot has CI evidence but no evidence from a machine that
  can run Docker directly -- re-verify there when one is available.
- The CatBoost Linux question above -- resolve from the CI job's actual
  result, not from this document.
- Multi-worker/multi-replica serving (see section 3) -- needs a real job
  queue.
- TLS/reverse proxy, secrets management for CHURNLENS_API_KEY, and actual
  hosting target (not decided here -- infra-specific).

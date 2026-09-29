# Decisions log — why, not just what

Format: ID, date, status, decision, why, evidence/source, model/version that recorded it.
IDs are sequential (`DEC-001`...). Before adding one, list this file and take the next number — do not guess it.

Entries DEC-001 to DEC-009 were back-filled on 2026-09-29 by `claude-sonnet-5-5` (Claude Code) from `HANDOFF.md`, `DEPLOYMENT.md`, `AUDIT.md` and the code; the model that made each original decision was not recorded at the time. Dates are those given in the source documents.

---

**DEC-001 — Select the model and threshold on out-of-fold predictions; touch the test set once** (Phase 1, ~2026-08). Accepted.
Why: earlier versions tuned on the test set and reported a leaked cost (README notes ₹382,500–₹392,500). Source: `backend/churn_intel/pipeline.py` docstring, README "A note on honesty".

**DEC-002 — One serialized sklearn `Pipeline` (engineer -> encode -> model) is both the training and the serving path** (Phase 1). Accepted.
Why: the old hand-rolled `get_dummies`/reindex at inference silently destroyed one-hot inputs (AUDIT §3.A). Consequence: the artifact pickles `churn_intel.features.engineer_features`, so that name and module are frozen unless we retrain.

**DEC-003 — Derive FN/FP costs from the data (CLV formula) instead of hardcoding them** (Phase 2). Accepted, assumptions challengeable.
Why: hardcoded 10,000/500 was a guess. Now `avg_monthly * retained_lifetime * gross_margin` (~730) and `0.20 * avg_monthly * 3` (~39). Assumptions (30% margin, 20% discount, 3 months) live in `backend/config.yaml`.
Open consequence: README result tables still use the old 10,000/500 basis (see the 2026-09-29 audit).

**DEC-004 — `config.yaml` hard-fails on any missing or wrong-typed key; model hyperparameters stay inline in `modeling.py`** (Phase 3 item 4). Accepted by the user's scoping choice.
Why: a silent fallback that trains against a stale value is exactly the failure the audit was removing. Source: HANDOFF §3, §8.

**DEC-005 — Split the god module into the `churn_intel` package; delete the flat shims** (Phase 3 and Phase 5.3). Accepted.

**DEC-006 — Serve with exactly one uvicorn worker** (Phase 6.2). Accepted.
Why: `jobs.py` and `models/last_run.json` are process-local state. Scaling needs a real queue and shared storage. Source: `DEPLOYMENT.md` §3.

**DEC-007 — API-key auth is opt-in via `CHURNLENS_API_KEY`, only on `/run-pipeline` and `/upload`** (Phase 6.2). Accepted with known gaps.
Why: keeps local dev and the test suite frictionless. Gaps (tracked in the 2026-09-29 audit, kept out of this public file): unset means open; the frontend cannot send the header yet.

**DEC-008 — CatBoost background-thread deadlock: did not reproduce; keep the fallback plan** (Phase 6.2). Accepted, not proven.
Evidence: `backend/diagnostics/catboost_thread_check.py`; Windows run and the CI Linux run (`ubuntu-latest`, python 3.11.16) both completed 6 fits in ~0.2 s on a synthetic 300-row set. Untested: real 5,634-row data, concurrent requests, other CatBoost versions. Fallback if it appears: train in a subprocess.

**DEC-009 — CI docker job is the container verification of record** (Phase 6.1). Accepted.
Why: no Docker/WSL on the dev machine; the `ubuntu-latest` runner is the only place the images have been built and booted. Limit: the smoke test only checks `/health` and static serving.

---

**DEC-010 — PROPOSED (2026-09-29, `claude-sonnet-5-5`): deploy as a read-only public demo; keep training offline.** Not yet decided by the maintainer.
Why (measured): the API process uses ~240 MB resident after boot and after 21 `/predict` calls, so it fits a 512 MB free instance; a training run needs several GB and cannot run on any free tier. Proposal: frontend on a static host, backend serving `/predict` plus a committed results snapshot, `/run-pipeline` disabled in production. The full plan is kept outside this repository.

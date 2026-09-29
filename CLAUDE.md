# ChurnLens — instructions for AI assistants (read first, every session)

1. `git fetch` first; `git pull --ff-only` only if the tree is clean.
2. Read in this order, and treat all of it as testimony to re-verify: `HANDOFF.md` -> `docs/CONSTRAINTS.md` -> `docs/ARCHITECTURE.md` -> `docs/FLOW.md` (when you need to know which files a change touches).
3. Python: always `venv\Scripts\python.exe` (3.11.9). Frontend: `npm` from the repo root.
4. Plan before you implement: state the approach and wait if it is not trivial. One logical change per request. Read the real diff.
5. Verify with `docs/TEST_CHECKLIST.md` and quote counts, not just exit codes. Never claim done without output from this session.
6. Memory: this machine can run low on RAM. Run one heavy job at a time (pytest, vitest, eslint, a training run); check free memory before a training run.
7. Log meaningful decisions in `docs/DECISIONS.md` (next free `DEC-` number, with the model/version). Use `docs/traces/README.md` for a bug or feature trace. Rollback steps: `docs/ROLLBACK.md`.
8. End every session by adding a 5-line handoff note to `HANDOFF.md` ("Session log"): what we did, what is left, what to watch out for, and the model/version used.
9. Commit/push only when asked; explicit paths only; no AI attribution in commits or PRs. The repo is public — no secrets, no exploit details.

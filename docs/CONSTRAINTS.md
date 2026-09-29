# Constraints — what an AI assistant (or a new contributor) must NOT do here

Read this before touching code. "Allow" means "allow within these limits". Source of each rule is in brackets.

## Never
1. **Never commit or push unless asked.** Stage explicit paths, never `git add -A`; run `git status --short` after every commit and remove stray zero-byte junk files. [HANDOFF §6/§7]
2. **Never add AI attribution** (`Co-Authored-By`, "Generated with") to commits, PRs or releases. Pranav is the sole developer of record. [global CLAUDE.md]
3. **Never synthesize a chart or number in the browser.** If the backend cannot supply it, show an honest empty/"not available" state. [AUDIT §4.B, §4.J]
4. **Never tune the model or threshold on the test set.** Selection uses out-of-fold predictions; the test set is evaluated once. [pipeline.py]
5. **Never rename `churn_intel/features.py` or `engineer_features`** without retraining the artifact — the pickle references it. [features.py note]
6. **Never loosen a guard test to make a change pass.** If a change breaks a guard, revert the change. [constitution R3]
7. **Never add a dependency without asking.** Pins are compiled offline; check `requirements.in` / `package.json` first. Never import something that is not declared.
8. **Never put secrets, keys or exploit details in this public repository.** Security findings go outside the repo.
9. **Never run more than one worker** in the API process (in-memory job tracker and `last_run.json`). [DEPLOYMENT §3]
10. **Never start a training run casually** — it needs several GB of free RAM and ~13 minutes. Check free memory first; run one heavy job at a time.
11. **Never touch `.claude-flow/` or `.claude/settings.local.json`** (tooling, untracked, not ours).

## Always
- Use the venv interpreter `venv\Scripts\python.exe` (Python 3.11.9); the system Python lacks the dependencies.
- `git fetch` first each session; `git pull --ff-only` only when the tree is clean.
- Read `HANDOFF.md`, then `docs/ARCHITECTURE.md`, before editing. Treat both as testimony and re-verify numbers you rely on.
- Plan first: state the approach in a paragraph before implementing; one logical change per request/PR.
- Read the actual diff before accepting any change; do not accept an AI summary of it.
- Verify with the commands in `docs/TEST_CHECKLIST.md` and quote the output (counts, not just exit codes).
- Record meaningful decisions in `docs/DECISIONS.md` with the model/version that made them.
- Additive checkpoints for restructures: add and verify new code before removing old code.
- CI runs only on pushes/PRs to `main` (plus a weekly cron): open a PR to get a run.

## Scope guard
No segmentation, confidence scoring, recommender or dashboard redesign without an explicit go-ahead. [HANDOFF §6]

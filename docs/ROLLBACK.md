# Rollback — the way back out

Last known-good: `main` at `8155402b` (merge of PR #3, CI green on 2026-09-28: `test`, `docker`, `catboost-thread-check` all success). Status of a rollback **drill**: NOT YET DRILLED — run section 4 once before the first public deploy.

## 1. Undo a merged PR (code)
```
git fetch
git checkout main && git pull --ff-only
git revert -m 1 <merge-commit-sha>        # new commit; never rewrite published history
git push origin <branch> ; open a PR ; wait for CI
```
`-m 1` keeps the mainline as the parent. Re-run `docs/TEST_CHECKLIST.md` items 1, 2, 9 afterwards.

## 2. Restore the model artifact
The deployed artifact is `models/churn_model.pkl` (+ metadata inside it: `git_commit`, `trained_at`, `sklearn_version`).
```
git log --oneline -- models/churn_model.pkl          # find the last good version
git checkout <good-sha> -- models/churn_model.pkl
```
Then check `/health` shows the expected `artifact_git_commit` and `/predict` returns a sane response. The pickle pins `sklearn` 1.8.0 and `churn_intel.features.engineer_features`; restoring an old artifact onto renamed code fails at load.

## 3. Roll back a container / hosted release
Tag every image with the git SHA (`GIT_SHA` build arg) and keep the previous tag. Rolling back = redeploy the previous tag; confirm `/health` `app_git_commit` equals the old SHA. Hosts with one-click rollback (e.g. Render, Cloud Run revisions) should be used instead of rebuilding.

## 4. Drill (do once, record the result here)
1. Deploy a deliberately harmless change (e.g. a version string). 2. Roll back using section 3. 3. Confirm `/health` reports the previous commit and `/predict` still returns the baseline value from `TEST_CHECKLIST.md` #7. 4. Write the date, the time it took, and anything that surprised you below.

Drill log: _(empty — not drilled yet)_

## 5. After any rollback
Add a `docs/DECISIONS.md` entry (what failed, what was reverted, evidence) and a trace file under `docs/traces/`.

# ChurnLens roadmap

Written 2026-11-15 from the audit of 2026-11-14 (model: `claude-fable-5-2`, Claude Code). This is the public plan. Security review notes and probe details are kept outside this repository, as `docs/CONSTRAINTS.md` rule 8 requires.

Evidence tags: RAN = measured during the audit, SRC = read in source during the audit.

## Where the project stands

ChurnLens has a sound model pipeline and an interface that is not yet a product. Audit score: 5.6 out of 10.

Strengths: model and threshold are chosen on out-of-fold predictions, training and serving share one pipeline object, the cost curves are real, and the backend suite runs in CI (114 tests passed on the Phase C branch, RAN).

Phases A (CI foundation), B (deploy blockers) and C (honesty fixes) are merged.

What holds it back:

1. **Production mode shows no product.** Results live only in an in-memory browser store that a pipeline run fills, and read-only production forbids the run. The demo button fails and the results pages are empty. The committed snapshot is loaded by the server and never requested by the frontend. Results are also lost on reload. (RAN + SRC)
2. **The interface is a stock dashboard and breaks on phones.** 23 pages follow the notebook's steps. At a 375 px width the page is 581 px wide. (RAN)
3. **Some displayed values are still not real.** The Optuna chart is generated with `Math.random`, the ANN ROC curve is a formula, SHAP risk directions come from a hard-coded name list, and several data pages are typed-in values true only for the demo file. (SRC)
4. **The cost model assumes every retention offer works.** `business_cost` prices only misses and false alarms. That assumption, not the data, puts the threshold at 0.07. (SRC)
5. **Open methodology items.** The score is shown as a probability without calibration, and the selected model is not distinguishable from logistic regression within fold-to-fold spread (CatBoost 0.8437 ± 0.0095, logistic regression 0.8476 ± 0.0112 cross-validated AUC, RAN from the results).

## Direction (DEC-012, DEC-013)

**Stage 1, the Retention Decision Lab.** A public site where a visitor sets customer value, offer cost, offer success rate and a contact budget, and sees who to contact, the expected profit against contacting nobody or everybody, and how uncertain that is. The Telco analysis sits underneath as a fully sourced case study, with a what-if panel for a single customer. Every number shows where it came from.

The decision rule: contacting a customer with churn probability p is worth p × s × V minus c, where V is the value kept, s the chance the offer works and c its cost. Contact when p exceeds c / (s × V). This only holds on calibrated probabilities.

**Stage 2, bring your own data, in the browser.** Train in the visitor's browser so the file is never uploaded. No accounts, no storage, free to host. Subject to a feasibility spike (download size, training time, supported models).

## Phases

| Phase | Scope | Done when | Sessions |
|---|---|---|---|
| 0. Repo hygiene | Branch protection on `main`, licence file and dataset attribution, Dependabot triage, make the CI audit job meaningful, refresh `HANDOFF.md` sections 0 to 8 | `main` is protected; no stale PRs; a red check means something | 0.5 |
| 1. Production shows the product | Results reach the browser without a run (DEC-011); pages render from fetched data; run and upload controls removed in read-only mode; what-if page uses the API's threshold; error boundary; end-to-end test in CI | A clean browser on a production-mode stack shows data on every route, after reload and from a pasted URL. The end-to-end job was watched failing first | 1 to 2 |
| 2. Remaining honesty | Remove or replace every generated, formula-built or typed-in value; one basis per card; one currency (US dollars); a source guard test | `git grep -n "Math.random\|Math.pow" src/pages` returns nothing and the guard fails when one is put back | 1 to 2 |
| 3. Preview deployment | Deployed by CI on merge, not linked publicly; rate limiting and response hardening | The live frontend can call the live API; latency on the free instance is measured | 1 |
| 4. Decision model and methodology | Calibration with a reliability plot; offer success rate and expected profit; bootstrap intervals; repeated cross-validation ranking; real ROC and PR points; one threshold grid; pipeline smoke test | Reliability bins within 0.05 of observed on held-out folds; ranking stated as mean ± standard deviation; artifact, snapshot and README regenerated together | 2 to 3 |
| 5. Redesign | About six destinations (Home, Decide, Customer, Evidence, Data and method, About); a written design system; responsive from 320 px; accessibility; designed loading, asleep, unreachable and empty states; shareable scenario URLs | No horizontal overflow at five widths; automated accessibility check with zero serious violations; main chunk under 300 kB | 4 to 5 |
| 6. Public site | Prerendered public routes, per-route titles and previews, sitemap, favicon, About, Method and privacy pages, cookieless analytics | Each public route returns its text without running JavaScript | 1 to 2 |
| 7. Launch | Production deploy, uptime monitor, error tracking, dependency refresh, load test, launch checklist, one rollback drilled and timed | Public URL over TLS; rollback write-up exists | 1 to 2 |
| 8. Stage 2 | Feasibility spike, then build | The spike reports download size and training time on the Telco file | 1, then 3 to 4 |

Order: 0, then 1. Phases 2 and 4 can run in parallel after 1. Phase 3 needs 1. Phase 5 follows 4, because the redesign is built around what the numbers mean. Then 6 and 7. Roughly 12 to 18 sessions to launch, Stage 2 excluded.

## Hosting (free tier)

Static site on a static host; a small API on a free container host for live single-customer scoring only. Free API instances sleep when idle and take about a minute to wake, so every chart must load without the API (DEC-011). Training is never exposed in production: it needs several GB of memory. Measured API memory: about 228 MB resident (RAN).

## Rules for implementing sessions

One pull request per plan row. Suite green at every checkpoint, quoting counts. Stop at each phase boundary for review. Commit with explicit file paths. For restructures, add and verify the new code before removing the old. Watch every new test fail before trusting it. Any phase that retrains regenerates the artifact, the snapshot and the README together. Open the running app, not just the diff: the main findings above all came from doing that.

## Not yet verified

Latency on a fractional CPU; a full retrain and repeated cross-validation; the what-if threshold defect on a fresh visit (established from source); in-browser training feasibility; the Telco dataset's redistribution terms.

## Open with the maintainer

The public contact address, and confirmation of the dataset's redistribution terms before launch.

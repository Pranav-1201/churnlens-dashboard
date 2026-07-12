# AUDIT.md — ChurnLens / Customer Churn Prediction System

**Audit date:** 2026-07-06
**Auditor:** Claude Code (staff-engineer-style onboarding audit; read-only — no code was changed)
**Scope:** `D:\MLProject` (git repo, remote `Pranav-1201/churnlens-dashboard`) plus the archive folder
`C:\Users\prana\Desktop\Projects and Research papers\ML Project - Customer Churn Prediction Model\Project`.

---

## 1. What actually exists (the task brief is significantly out of date)

The brief describes "a single ~19,000-line notebook exported to HTML... no `src/`, no API, no dashboard,
no requirements.txt, no .gitignore." **That was true in January; it is not true now.** The repo today is a
working full-stack application:

| Component | State |
|---|---|
| `notebooks/Cuatomer_Churn_Model.ipynb` | The real notebook (39 code cells, Sections 1–30). The HTML on Desktop is just an export of an older version. |
| `backend/` | FastAPI app ("ChurnLens API v3.0.0"): `main.py` (9 endpoints), `pipeline.py` (890-line port of the notebook that retrains 7 models per request), `predictor.py` (single-customer inference), `schemas.py` (pydantic models), `job_store.py` (in-memory async job tracker), `model_loader.py` |
| `src/` | React 18 + Vite + TypeScript + shadcn/Tailwind dashboard, ~23 routed pages mirroring the notebook sections (EDA → models → threshold → SHAP → business analysis), zustand store, axios/fetch API layer, job polling |
| `data/telco_churn.csv` | Telco dataset (~7,043 rows), tracked in git |
| `models/churn_model.pkl` | Saved artifact: `{"model": sklearn Pipeline (scaler+LR), "threshold": 0.13}` — **no `feature_names` key** (predates the notebook's fixed save code). `scaler.pkl` is an orphan from February |
| `requirements.txt`, `.gitignore`, `.env` | All exist (contrary to the brief) — with issues, see §2 row 12 |
| Tests | One placeholder vitest test (`expect(true).toBe(true)`). Zero Python tests |
| Desktop folder | Read-only archive: HTML export, old `telco-customer-churn-logisticregression.ipynb`, roadmap docx, lab-file docx, ~30 dashboard screenshots. Nothing there is the source of truth |

**What runs end-to-end today:** `uvicorn main:app` (from `backend/`) + `npm run dev` → upload CSV or use demo
→ background thread retrains LR/DT/RF/XGB/LGBM/CatBoost/Stacking → dashboard shows metrics, SHAP, EDA,
threshold analysis; `/predict` scores a single customer. The screenshots on Desktop (May 2026) and the git
history ("Stabilized frontend integration" ×4) confirm this flow works.

**Still genuinely missing from the original 9-phase roadmap:** customer segmentation, confidence scoring,
retention recommendation engine, experiment tracking, Docker/CI, config management, drift monitoring,
deployment. The ANN exists in the notebook only — the backend pipeline never trains it, so the dashboard's
ANN pages have no real data source.

---

## 2. Verification of the brief's 14 "confirmed bugs"

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Threshold tuned on test set | **CONFIRMED** | Notebook Sections 18/22/26/27 all sweep thresholds against `y_test`; backend calls `find_best_threshold(y_test, y_prob)` for every model (`backend/pipeline.py:408, 447, 487, 558, 618, 698, 762`) |
| 2 | Model selected by test-set cost | **CONFIRMED** | `best = min(model_results, key=lambda m: m["cost"])` where cost is test-set cost (`backend/pipeline.py:794`); notebook Section 26 does the same |
| 3 | Cost matrix hardcoded, undefended | **CONFIRMED** | `COST_FN = 10_000; COST_FP = 500` (`backend/pipeline.py:58-59`), duplicated in notebook cells 19/33/34 and in frontend store defaults. No derivation from MonthlyCharges/CLV anywhere |
| 4 | No cost-ratio sensitivity analysis | **CONFIRMED** — and worse, see §4.B: the UI chart that looks like one is fabricated |
| 5 | TotalCharges imputation unvalidated | **CONFIRMED** | Zero-fill for `tenure==0`, median otherwise (notebook cell 5; `backend/pipeline.py:79-83`). Reasonable, but no before/after distribution check |
| 6 | Statistical rigor buried/disconnected | **PARTIALLY WRONG, then CONFIRMED** | The notebook has *more* rigor than the brief credits: Section 22B (calibration curves + ECE) and 22C (McNemar's, DeLong's, bootstrap 95% CIs, a "publication-ready Table I"). But none of it reaches the final summary, README, backend, or dashboard. Worse: cell 29 concludes "XGBoost's distinct error profile justifies its deployment preference" while the README declares Logistic Regression the final model — the artifacts tell contradictory stories |
| 7 | SHAP uses slow model-agnostic path | **PARTIALLY STALE** | Notebook Section 23 already uses `TreeExplainer` on `base_xgb`; backend `_get_explainer` (`pipeline.py:187-217`) dispatches Linear/Tree/Kernel correctly. Remaining offenders: notebook helper cells 36–37 (`shap.Explainer(model.predict_proba, X)` — slow permutation path) and `predictor.py:87` (`shap.Explainer(final_model)` with no masker → raises for LR → silently falls into an occlusion loop that is **not SHAP** but is returned as `shap_values`) |
| 8 | Train/inference column mismatch, no unified Pipeline | **CONFIRMED — and materially worse** | See §3.A. The saved artifact contains only scaler+LR; encoding/feature-engineering live as duplicated code in three places (notebook cell 35, `backend/pipeline.py`, `backend/predictor.py`) with a hand-maintained 40-column `FEATURE_COLUMNS` list and `str.replace(" ", "_")` patches |
| 9 | No inference schema validation | **PARTIAL** | `schemas.py` has a pydantic `CustomerInput` (better than the brief claims) but all categoricals are unconstrained `str` — `Contract="banana"` passes validation. `/run-pipeline` checks only 4 required columns; the pipeline then KeyErrors on missing service columns (§4.H) |
| 10 | Print/emoji logging, no experiment tracking | **CONFIRMED** | Throughout notebook *and* backend (`print("DEBUG PATH:...")` at import time in `main.py:48`). No logging module, no MLflow/experiments log |
| 11 | Unconditional torch/tensorflow import | **CONFIRMED (variant)** | Notebook cell 1 imports torch at top. Backend imports torch *inside* the CatBoost block just for a GPU check (`pipeline.py:671`) — if torch is absent, the broad `except` silently drops CatBoost from the model zoo. No tensorflow anywhere in the current notebook (that claim applied to the old lab-file version) |
| 12 | No requirements.txt / .gitignore / lockfile | **STALE** | Both exist. Real remaining gaps: ML deps unpinned (`pandas`, `torch`, … no versions), no Python lockfile, `.env` is *tracked in git*, `dist/` build output is untracked-but-not-ignored, and both `bun.lock` and `package-lock.json` exist (pick one package manager) |
| 13 | No automated tests | **CONFIRMED** | One trivial vitest placeholder; zero pytest; none of the pure functions (feature engineering, cost/threshold search, input alignment) are tested — and §3.A proves exactly why that matters |
| 14 | No one-command reproducibility | **CONFIRMED** | Seeds are set (good), but no Makefile/script from raw CSV → saved model, no recorded versions |

---

## 3. Headline new finding (not in the brief)

### A. `/predict` silently destroys all one-hot categorical inputs — CRITICAL, verified empirically

`predictor.prepare_input()` runs `pd.get_dummies(df, drop_first=True)` on a **single-row** DataFrame.
With one row, every object-dtype column has exactly one category present, so `drop_first=True` drops it —
producing **zero dummy columns**. The subsequent `reindex(columns=FEATURE_COLUMNS, fill_value=0)` then fills
every OHE column with 0.

Verified against the real saved model with a One-year-contract, Fiber, Partner=Yes customer:

```
gender_Male                             = 0   (customer is Female — coincidentally right)
Partner_Yes                             = 0   (WRONG — Partner is Yes)
Contract_One_year                       = 0   (WRONG — model sees Month-to-month baseline)
InternetService_Fiber_optic             = 0   (WRONG at OHE level; partially rescued by engineered FiberUser=1)
PaymentMethod_Credit_card_(automatic)   = 0   (WRONG)
OnlineSecurity_Yes / StreamingTV_Yes /
MultipleLines_Yes / DeviceProtection_Yes = 0  (all WRONG)
```

Only numeric columns, engineered features (`FiberUser`, `IsMonthToMonth`, `ServiceCount`, `HighSpender`,
`LowEngagement`), and `TenureGroup_*` (survives because `pd.cut` produces a Categorical dtype with all
levels defined) carry real signal. Every prediction served by the API misencodes roughly half of the model's
40 features. `Contract` is the strongest churn driver in this dataset, and it is always read as
month-to-month. The notebook's own `predict_churn` (cell 35) has the same defect for single-row raw input —
its "Test 2" passes only because the output is never checked against a correctly-encoded baseline.

**Fix (same as brief's bug 8, now non-negotiable):** one fitted `ColumnTransformer`/`Pipeline`
(engineering → encoding → scaling → model) serialized as a single artifact. That removes the reindex/
string-replace/hand-rolled-OHE code paths entirely.

---

## 4. Other new findings

**B. The dashboard's threshold/cost curves are fabricated (HIGH). — FIXED in Phase 2.**
> Resolved 2026-07-07. The backend now persists the selected model's out-of-fold
> validation predictions and computes the curve by exact confusion-matrix
> evaluation at 99 thresholds (`cost_threshold_curve` in `backend/pipeline.py`).
> A new `GET /threshold-curve?cost_fn=&cost_fp=` endpoint re-scores those stored
> predictions with the caller's costs, so the Settings inputs genuinely drive the
> chart. `buildThresholdData`/`buildCostCurve` are deleted; the pages render
> backend data verbatim and show an error rather than synthesising a curve when
> the backend is unreachable. Guarded by `tests/test_threshold_curve.py` and
> `tests/test_threshold_curve_api.py` (the old sigmoid curve fails all 99 points
> of the exactness assertion). Note: a *separate* fabrication remains in
> `src/pages/ANNTraining.tsx` (synthetic loss curve labelled as experiment data).

Original finding:
`src/pages/ThresholdOptimization.tsx:37-86` synthesizes precision/recall/cost across thresholds from a
*single* confusion matrix using an invented sigmoid/exponential extrapolation (comment: "We model this as a
sigmoid ramp"). The chart looks like model output; it is not. The backend computes the real sweep internally
(`find_best_threshold`) but discards everything except the argmin. Relatedly, the cost inputs in Settings
(`setCosts`) only feed this fabricated frontend math — **custom costs are never sent to the backend**, so the
"configurable cost matrix" is cosmetic. Fix: have the backend return the actual per-threshold
cost/precision/recall table (~50 rows) and drive both the chart and the what-if slider from real data.

**C. The "clean" CV numbers also leak (HIGH).**
In the notebook, every model's `cross_val_score` is computed on the **full dataset** `X, y` — including the
test rows (cells 11–17, 20, 21: LR, DT, RF, XGB, LGBM, Stacking, final CV check, and the Optuna objective).
So even the numbers meant to be leakage-free include the test set, and Optuna's chosen `C` was tuned on it.
The backend port fixed this for most models (CV on `X_train`) **except CatBoost**, whose manual CV still
splits the full `X_cat, y` (`backend/pipeline.py:711`).

**D. Artifacts and reported numbers are internally inconsistent (MEDIUM).**
- `models/churn_model.pkl` (Mar 30) predates the notebook's fixed save format: no `feature_names`, and
  `model_loader.py:36-39` papers over it with a hardcoded `0.13` fallback threshold.
- README contradicts itself: "Optimized cost ₹382,500 / savings ₹561,500" vs. the results table's ₹392,500;
  the table shows ANN at ₹383,500 — *cheaper* than the declared winner LR at ₹392,500 (ANN was excluded from
  selection in notebook cell 33 without the README saying so); README's "Project Structure" section describes
  a layout that doesn't exist; referenced images (`image.png`, `images/cost_vs_threshold.png`) aren't in the repo.
- Notebook cell 29 recommends XGBoost for deployment; README ships LR.

**E. Per-customer SHAP rows can be attributed to the wrong customer (MEDIUM).**
`backend/pipeline.py:834-843` takes `idx_test` (original DataFrame index labels) and uses them as *positional*
`iloc` lookups on `df_clean.reset_index(drop=True)`. Labels ≠ positions whenever `clean_data` drops rows
(non-Yes/No `Churn`) or an uploaded CSV has a non-contiguous index — the SHAP panel would then display one
customer's attributes with another customer's explanation. Works by luck on the demo CSV.

**F. Risk labels contradict the decision threshold (MEDIUM).**
`predictor.py:124-129` hardcodes risk bands at 0.7/0.4 while the model classifies churn at 0.13 — a customer
with p=0.2 is simultaneously "prediction: 1 (churn)" and "LOW RISK". The batch path uses a *different* scheme
(`>= best_threshold` → "HIGH RISK" else "LOW RISK", `pipeline.py:865`). Unify on distance-from-threshold bands.

**G. Ops/hygiene issues (LOW-MEDIUM).**
- CORS: `allow_origins=[..., "*"]` with `allow_credentials=True` (`main.py:39`) — invalid per spec and a
  security smell.
- Hardcoded absolute demo path `D:/MLProject/data/telco_churn.csv` (`main.py:46`) — breaks on any other
  machine/container.
- All results live in process memory: a server restart loses every job; `/metrics`, `/shap-global`, `/eda`
  serve the *last run by anyone*, not the caller's job.
- `backend/` is not a package (no `__init__.py`); imports only resolve when CWD is `backend/`.
- Each `/run-pipeline` request retrains ~7 models (incl. 5-fold CV ×6, 5 extra CatBoost fits, isotonic
  calibration) in a background thread of the web process — acceptable for a demo, must be stated as such.

**H. Weak failure modes on upload (LOW).**
`/run-pipeline` validates only `{tenure, MonthlyCharges, TotalCharges, Churn}` (`main.py:113`), but
`engineer_features` immediately indexes six service columns (`pipeline.py:118-125`) → a CSV missing
`OnlineSecurity` fails mid-job with a raw KeyError traceback instead of a 422 with a clear message.

**I. Minor.** `framer-motion` is installed (`package.json`) but nothing in `src/pages` imports it — removal
candidate. `notebooks/` contains generated artifacts (`best_ann.pt`, `catboost_info/`, PNGs) partially
ignored, partially untracked.

**J. ANNTraining.tsx fabricated its loss curve (same class as §4.B). — FIXED 2026-07-12.**
> The page generated its train/val loss with `0.65*exp(-0.08*epoch)+0.32` while labelling it "notebook
> experiment data". Now it plots the REAL per-epoch history recorded by `backend/export_ann_history.py`
> (same architecture/seed as the notebook) into `src/data/ann_history.json`, with the true early-stop epoch
> and test AUC. Also FIXED this pass: brief #3 (hardcoded cost matrix → `derive_costs()` CLV formula) and
> brief #4 (cost-ratio sensitivity → `cost_sensitivity_curve()` + `/cost-sensitivity` + dashboard chart).

---

## 5. What I did **not** verify (honesty section)

- I did not execute the full training pipeline or notebook (multi-minute run; audit was read-only). The
  leakage findings come from code reading; the `/predict` encoding bug **was** verified by running the real
  `prepare_input` + saved model in the project venv.
- I did not run `npm run test` / `npm run build` or boot the servers.
- The four `.docx` planning/lab documents were not parsed (`python-docx` not installed in the venv); their
  content is assumed to match the brief's description of the 9-phase roadmap.

---

## 6. Priority order for the fix phase (proposed)

1. **Correctness (blocks everything):** single fitted sklearn `Pipeline` artifact (kills §3.A and brief #8 by
   construction) + proper train/val/test protocol: select model & threshold on validation/OOF only, report
   test metrics once (brief #1, #2, §4.C).
2. **Honest numbers:** re-run, record corrected cost savings vs. the old leaked ones (README/LESSONS material);
   surface the existing bootstrap-CI/calibration work in the final table; fix README contradictions (§4.D).
3. **Cost model:** derive FN/FP costs from `MonthlyCharges`/CLV with a documented formula, parameterize
   end-to-end (backend accepts costs → real sensitivity curve → dashboard slider drives real data, replacing
   the fabricated chart §4.B) (brief #3, #4).
4. **Tests + CI:** pytest for features/cost/threshold/alignment (a regression test for §3.A first), GitHub
   Actions, pinned deps.
5. **Roadmap gaps:** segmentation, confidence scoring, recommendation engine, experiment log.
6. **Packaging/ops:** config file, structured logging, Docker, README rewrite, deployment.

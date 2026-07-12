"""
pipeline.py — ChurnLens training pipeline.

Correctness contract (Phase 1 fix pass, see AUDIT.md):
  * Every model is a single sklearn Pipeline (engineer -> encode -> model) built in
    features.py — the same object used verbatim at inference. No hand-rolled
    get_dummies/reindex anywhere (fixes §3.A / brief #8 by construction).
  * Thresholds and the winning model are chosen ONLY on out-of-fold predictions
    over the training split (StratifiedKFold). The test set is evaluated exactly
    once, at the end, with the model and threshold already locked in
    (fixes brief #1/#2 and §4.C — this includes CatBoost's CV).
  * Per-customer SHAP rows are mapped back by index LABEL, not position (§4.E).
  * Risk bands derive from the actual decision threshold (§4.F).
"""

import os
import pickle
import subprocess
import traceback
import warnings
from datetime import datetime, timezone
from typing import Callable, Optional

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier, StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score, average_precision_score, confusion_matrix, roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier
import sklearn
import shap

from features import (
    build_catboost_pipeline,
    build_model_pipeline,
    engineer_features,
    feature_names_of,
    risk_level,
)

# Optional boosting imports — gracefully degrade if not installed
try:
    from xgboost import XGBClassifier
    HAS_XGB = True
except ImportError:
    HAS_XGB = False
    print("[WARNING] xgboost not installed -- XGBoost model will be skipped")

try:
    from lightgbm import LGBMClassifier
    HAS_LGB = True
except ImportError:
    HAS_LGB = False
    print("[WARNING] lightgbm not installed -- LightGBM model will be skipped")

try:
    from catboost import CatBoostClassifier, Pool
    HAS_CAT = True
except ImportError:
    HAS_CAT = False
    print("[WARNING] catboost not installed -- CatBoost model will be skipped")

warnings.filterwarnings("ignore")

# Fallback costs, used only if derivation from data is impossible. These are the
# original hardcoded guesses, kept solely as a last resort — real runs derive
# costs from the dataset via derive_costs() below.
COST_FN = 10_000
COST_FP = 500

RANDOM_STATE = 42

# ── Cost derivation (replaces the hardcoded COST_FN/COST_FP guess) ────────────
# Assumptions, documented so a reviewer can challenge them:
GROSS_MARGIN = 0.30            # telecom gross margin — a missed churner loses
                              #   margin, not gross revenue
RETENTION_DISCOUNT = 0.20     # a retention offer is ~20% off ...
OFFER_DURATION_MONTHS = 3     #   ... for ~3 months


def derive_costs(df: pd.DataFrame) -> tuple[int, int, dict]:
    """Derive FN/FP costs from the dataset instead of guessing them.

    FN (missed churner)  = expected remaining customer lifetime value lost
        = mean(MonthlyCharges) * mean_tenure_of_retained_customers * GROSS_MARGIN
      i.e. the margin on the revenue a churner would have produced over a typical
      retained customer's lifetime.

    FP (wasted retention offer) = the incentive spent on a customer who was not
      going to churn
        = RETENTION_DISCOUNT * mean(MonthlyCharges) * OFFER_DURATION_MONTHS

    Returns (cost_fn, cost_fp, derivation) where `derivation` documents every
    input so the dashboard can show the formula. Falls back to COST_FN/COST_FP
    if the required columns are missing.
    """
    if "MonthlyCharges" not in df.columns or "tenure" not in df.columns:
        return COST_FN, COST_FP, {"method": "fallback_constants",
                                  "reason": "MonthlyCharges/tenure missing"}

    mc = pd.to_numeric(df["MonthlyCharges"], errors="coerce")
    avg_monthly = float(mc.mean())

    # Lifetime proxy: how long a *retained* customer stays.
    if "Churn" in df.columns:
        churn = df["Churn"].astype(str).str.strip().str.lower()
        retained_tenure = pd.to_numeric(df.loc[churn == "no", "tenure"], errors="coerce")
        lifetime = float(retained_tenure.mean()) if retained_tenure.notna().any() \
            else float(pd.to_numeric(df["tenure"], errors="coerce").mean())
    else:
        lifetime = float(pd.to_numeric(df["tenure"], errors="coerce").mean())

    cost_fn = int(round(avg_monthly * lifetime * GROSS_MARGIN))
    cost_fp = int(round(RETENTION_DISCOUNT * avg_monthly * OFFER_DURATION_MONTHS))
    cost_fp = max(cost_fp, 1)  # guard against zero

    derivation = {
        "method": "clv_derived",
        "avg_monthly_charges": round(avg_monthly, 2),
        "retained_lifetime_months": round(lifetime, 2),
        "gross_margin": GROSS_MARGIN,
        "retention_discount": RETENTION_DISCOUNT,
        "offer_duration_months": OFFER_DURATION_MONTHS,
        "cost_fn": cost_fn,
        "cost_fp": cost_fp,
        "cost_fn_formula": "avg_monthly_charges * retained_lifetime_months * gross_margin",
        "cost_fp_formula": "retention_discount * avg_monthly_charges * offer_duration_months",
    }
    return cost_fn, cost_fp, derivation


# ── Data cleaning ────────────────────────────────────────────────────────────
def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    REQUIRED_COLUMNS = ["tenure", "MonthlyCharges", "TotalCharges", "Churn"]
    missing_required = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_required:
        raise ValueError(
            f"Dataset is missing required column(s): {', '.join(missing_required)}. "
            f"The pipeline requires these columns: {', '.join(REQUIRED_COLUMNS)}. "
            f"Please check your CSV file and ensure these columns exist."
        )

    df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce")
    df.loc[df["tenure"] == 0, "TotalCharges"] = 0
    df["TotalCharges"] = df["TotalCharges"].fillna(df["TotalCharges"].median())

    df["Churn"] = df["Churn"].map({"Yes": 1, "No": 0})
    df = df[df["Churn"].notna()]

    if "customerID" in df.columns:
        df.drop(columns=["customerID"], inplace=True)

    return df


# ── Cost / threshold ─────────────────────────────────────────────────────────
def business_cost(y_true, y_pred, cost_fn=COST_FN, cost_fp=COST_FP) -> int:
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()
    return int(fn * cost_fn + fp * cost_fp)


def find_best_threshold(y_true, y_prob, cost_fn=COST_FN, cost_fp=COST_FP):
    best_thresh, best_cost = 0.5, float("inf")
    for t in np.linspace(0.01, 0.99, 50):
        preds = (y_prob >= t).astype(int)
        cost = business_cost(y_true, preds, cost_fn, cost_fp)
        if cost < best_cost:
            best_cost = cost
            best_thresh = float(t)
    return best_thresh, best_cost


# Shared grid for the published cost-vs-threshold curve (0.01..0.99, step 0.01).
THRESHOLD_GRID = np.round(np.arange(0.01, 1.00, 0.01), 2)


def cost_threshold_curve(y_true, y_prob, cost_fn=COST_FN, cost_fp=COST_FP, grid=None):
    """Real precision/recall/F1/cost at each threshold, computed directly from
    (y_true, y_prob) — no interpolation, no simulation.

    Used for both the shipped curve (on out-of-fold validation predictions) and
    the /threshold-curve endpoint (recomputed with caller-supplied costs). Every
    point is an exact confusion-matrix evaluation, so the plotted cost equals
    fn*cost_fn + fp*cost_fp by construction (see tests/test_threshold_curve.py).
    """
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob, dtype=float)
    if grid is None:
        grid = THRESHOLD_GRID

    rows = []
    for t in grid:
        t = float(t)
        pred = (y_prob >= t).astype(int)
        tp = int(np.sum((pred == 1) & (y_true == 1)))
        fp = int(np.sum((pred == 1) & (y_true == 0)))
        fn = int(np.sum((pred == 0) & (y_true == 1)))
        tn = int(np.sum((pred == 0) & (y_true == 0)))
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
        rows.append({
            "threshold": round(t, 2),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "cost": int(fn * cost_fn + fp * cost_fp),
        })
    return rows


DEFAULT_COST_RATIOS = [1, 2, 3, 5, 8, 10, 15, 20, 30, 50, 75, 100]


def cost_sensitivity_curve(y_true, y_prob, cost_fp=COST_FP, ratios=None):
    """How the cost-optimal threshold and its cost shift as the FN/FP cost ratio
    varies. FP cost is held fixed; FN = ratio * FP. Each point reuses the exact
    cost_threshold_curve(), so nothing here is interpolated.

    Demonstrates that cost-sensitive learning is not a fixed point: the operating
    threshold you should deploy depends entirely on how much a miss costs
    relative to a false alarm.
    """
    if ratios is None:
        ratios = DEFAULT_COST_RATIOS
    out = []
    for r in ratios:
        cost_fn = float(r) * float(cost_fp)
        curve = cost_threshold_curve(y_true, y_prob, cost_fn, cost_fp)
        opt = min(curve, key=lambda p: p["cost"])
        out.append({
            "ratio": float(r),
            "cost_fn": cost_fn,
            "cost_fp": float(cost_fp),
            "optimal_threshold": opt["threshold"],
            "optimal_cost": opt["cost"],
            "recall_at_optimal": opt["recall"],
            "precision_at_optimal": opt["precision"],
        })
    return out


# ── Out-of-fold validation ───────────────────────────────────────────────────
def oof_probabilities(builder: Callable[[], Pipeline], X: pd.DataFrame, y: np.ndarray, skf: StratifiedKFold):
    """Out-of-fold churn probabilities on the TRAINING split only.

    Every row's probability comes from a model that never saw that row, so
    threshold search and model selection on these values are leakage-free.
    Also returns per-fold ROC-AUC (replaces the old cross_val_score, same
    number of fits).

    `builder` returns a fresh unfitted pipeline per fold — sklearn's clone()
    chokes on CatBoostClassifier (it mutates its class_weights param), so we
    rebuild instead of cloning.
    """
    oof = np.zeros(len(y), dtype=float)
    fold_aucs = []
    for tr_idx, va_idx in skf.split(X, y):
        m = builder()
        m.fit(X.iloc[tr_idx], y[tr_idx])
        probs = m.predict_proba(X.iloc[va_idx])[:, 1]
        oof[va_idx] = probs
        fold_aucs.append(float(roc_auc_score(y[va_idx], probs)))
    return oof, fold_aucs


def _run_model(name, builder, X_train, y_train, X_test, y_test, skf,
               cost_fn=COST_FN, cost_fp=COST_FP):
    """Validate (OOF), fit on the full training split, report test metrics.

    'cost' and 'threshold' come from validation (OOF) — they are what model
    selection uses. Test-set numbers are for reporting only.
    """
    oof, fold_aucs = oof_probabilities(builder, X_train, y_train, skf)
    threshold, val_cost = find_best_threshold(y_train, oof, cost_fn, cost_fp)

    pipeline = builder()
    pipeline.fit(X_train, y_train)
    probs_test = pipeline.predict_proba(X_test)[:, 1]

    y_pred_default = (probs_test >= 0.5).astype(int)
    return {
        "name": name,
        "accuracy": round(accuracy_score(y_test, y_pred_default), 4),
        "roc_auc": round(roc_auc_score(y_test, probs_test), 4),
        "pr_auc": round(average_precision_score(y_test, probs_test), 4),
        "cost": int(val_cost),
        "threshold": round(float(threshold), 4),
        "cost_basis": "validation_oof",
        "confusion_matrix": confusion_matrix(y_test, y_pred_default).tolist(),
        "cv_scores": [round(s, 4) for s in fold_aucs],
        "cv_mean": round(float(np.mean(fold_aucs)), 4),
        "cv_std": round(float(np.std(fold_aucs)), 4),
        "_model_obj": pipeline,
        "_probs_test": probs_test,
        "_oof_probs": oof,
    }


# ── SHAP ─────────────────────────────────────────────────────────────────────
def _get_explainer(model, X_background):
    """Pick the correct SHAP explainer for the FINAL estimator of a pipeline
    (inputs are already encoded)."""
    if isinstance(model, LogisticRegression):
        return shap.LinearExplainer(model, X_background)
    if isinstance(model, (RandomForestClassifier, DecisionTreeClassifier)):
        return shap.TreeExplainer(model)
    if HAS_XGB and isinstance(model, XGBClassifier):
        return shap.TreeExplainer(model)
    if HAS_LGB and isinstance(model, LGBMClassifier):
        return shap.TreeExplainer(model)
    bg = X_background[:50] if len(X_background) > 50 else X_background
    return shap.KernelExplainer(lambda x: model.predict_proba(x)[:, 1], bg)


def _shap_matrix(best_pipeline: Pipeline, X_test_raw: pd.DataFrame, max_rows: int):
    """SHAP values (n_rows x n_features) for the pipeline's final estimator,
    computed in its own encoded feature space. Returns (matrix, feature_names)."""
    prep = Pipeline(best_pipeline.steps[:-1])
    model = best_pipeline.named_steps["model"]
    transformed = prep.transform(X_test_raw.iloc[:max_rows])

    if HAS_CAT and isinstance(model, CatBoostClassifier):
        cat_cols = transformed.select_dtypes(include=["object"]).columns.tolist()
        pool = Pool(transformed, cat_features=cat_cols)
        vals = model.get_feature_importance(pool, type="ShapValues")
        return vals[:, :-1], [str(c).replace(" ", "_") for c in transformed.columns]

    X_enc = np.asarray(transformed, dtype=float)
    explainer = _get_explainer(model, X_enc)
    vals = explainer.shap_values(X_enc)
    if isinstance(vals, list):  # older SHAP binary-classification format
        vals = vals[1]
    vals = np.asarray(vals)
    if vals.ndim == 3:  # (n, features, classes)
        vals = vals[:, :, 1]
    return vals, feature_names_of(best_pipeline)


# ── EDA summary (unchanged) ─────────────────────────────────────────────────
def compute_eda_summary(df_raw: pd.DataFrame) -> dict:
    df = df_raw.copy()

    if "Churn" in df.columns:
        df["Churn"] = df["Churn"].astype(str).str.strip().str.lower()
        df["Churn"] = df["Churn"].map({"yes": 1, "no": 0})
        df["Churn"] = pd.to_numeric(df["Churn"], errors="coerce")
        df = df.dropna(subset=["Churn"])

    if "TotalCharges" in df.columns:
        df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce")

    if len(df) == 0:
        return {
            "total_customers": 0,
            "churn_rate": 0.0,
            "churn_count": 0,
            "retain_count": 0,
            "by_contract": [],
            "tenure_distribution": [],
            "monthly_charges_distribution": [],
            "feature_stats": {},
        }

    total_customers = int(len(df))
    churn_rate = float(df["Churn"].mean())
    churn_count = int(df["Churn"].sum())
    retain_count = int(total_customers - churn_count)

    by_contract = []
    if "Contract" in df.columns:
        by_contract = (
            df.groupby("Contract")["Churn"].mean()
            .reset_index()
            .rename(columns={"Churn": "churn_rate"})
            .to_dict(orient="records")
        )

    tenure_dist = []
    if "tenure" in df.columns and len(df["tenure"].dropna()) > 0:
        tenure_bins = pd.cut(df["tenure"], bins=10)
        tenure_df = (
            df.groupby(tenure_bins, observed=False)["Churn"]
            .agg(["count", "mean"])
            .reset_index()
            .rename(columns={"count": "customers", "mean": "churn_rate"})
        )
        tenure_df["bin"] = tenure_df.iloc[:, 0].apply(lambda x: str(x))
        tenure_df = tenure_df.drop(columns=[tenure_df.columns[0]])
        tenure_dist = tenure_df.to_dict(orient="records")

    mc_dist = []
    if "MonthlyCharges" in df.columns and len(df["MonthlyCharges"].dropna()) > 0:
        mc_bins = pd.cut(df["MonthlyCharges"], bins=8)
        mc_df = (
            df.groupby(mc_bins, observed=False)["Churn"]
            .agg(["count", "mean"])
            .reset_index()
            .rename(columns={"count": "customers", "mean": "churn_rate"})
        )
        mc_df["bin"] = mc_df.iloc[:, 0].apply(lambda x: str(x))
        mc_df = mc_df.drop(columns=[mc_df.columns[0]])
        mc_dist = mc_df.to_dict(orient="records")

    feature_stats = {}
    if "tenure" in df.columns:
        feature_stats["mean_tenure"] = round(float(df["tenure"].mean()), 2)
    if "MonthlyCharges" in df.columns:
        feature_stats["mean_monthly_charges"] = round(float(df["MonthlyCharges"].mean()), 2)
    if "TotalCharges" in df.columns:
        feature_stats["mean_total_charges"] = round(float(df["TotalCharges"].mean()), 2)

    return {
        "total_customers": total_customers,
        "churn_rate": round(churn_rate, 4),
        "churn_count": churn_count,
        "retain_count": retain_count,
        "by_contract": by_contract,
        "tenure_distribution": tenure_dist,
        "monthly_charges_distribution": mc_dist,
        "feature_stats": feature_stats,
    }


# ── Artifact ─────────────────────────────────────────────────────────────────
def _git_commit() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=os.path.dirname(os.path.abspath(__file__)),
            capture_output=True, text=True, timeout=5, check=True,
        ).stdout.strip()
    except Exception:
        return "unknown"


def save_artifact(path, pipeline, threshold, metadata):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "wb") as f:
        pickle.dump({"pipeline": pipeline, "threshold": float(threshold), "metadata": metadata}, f)


# ── Main entry point ─────────────────────────────────────────────────────────
def run_pipeline(
    df: pd.DataFrame,
    progress_callback: Optional[Callable[[int, str], None]] = None,
    artifact_path: Optional[str] = None,
    cost_fn: Optional[int] = None,
    cost_fp: Optional[int] = None,
) -> dict:
    def progress(pct: int, msg: str):
        if progress_callback:
            progress_callback(pct, msg)

    results = {}

    try:
        # Costs are DERIVED from the dataset (CLV-based), not hardcoded. An
        # explicit cost_fn/cost_fp still overrides (e.g. a user's what-if).
        derived_fn, derived_fp, cost_derivation = derive_costs(df)
        if cost_fn is None:
            cost_fn = derived_fn
        if cost_fp is None:
            cost_fp = derived_fp
        results["cost_derivation"] = cost_derivation

        progress(5, "Computing EDA summary")
        results["eda"] = compute_eda_summary(df)

        progress(12, "Cleaning data")
        df_clean = clean_data(df)
        if len(df_clean) == 0:
            raise ValueError("Dataset became empty after cleaning")

        y_all = df_clean["Churn"].values.astype(int)
        X_all = df_clean.drop(columns=["Churn"])

        progress(20, "Splitting train / test sets")
        X_train, X_test, y_train, y_test = train_test_split(
            X_all, y_all, test_size=0.2, random_state=RANDOM_STATE, stratify=y_all,
        )

        skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)

        num_negative = int((y_train == 0).sum())
        num_positive = int((y_train == 1).sum())
        scale_pos_weight = num_negative / num_positive

        # Categorical columns after feature engineering (for CatBoost)
        engineered_sample = engineer_features(X_train.head(50))
        cat_cols = engineered_sample.select_dtypes(include=["object", "category"]).columns.tolist()

        # ── Model zoo: (name, progress pct, builder returning a fresh
        #    raw-input pipeline). Builders instead of instances because the
        #    OOF loop needs a clean unfitted model per fold. ─────────────────
        def make_lr():
            return build_model_pipeline(
                LogisticRegression(max_iter=1000, class_weight="balanced", n_jobs=-1),
                scale_numeric=True)

        def make_dt():
            return build_model_pipeline(DecisionTreeClassifier(
                max_depth=6, min_samples_split=10, min_samples_leaf=5,
                class_weight="balanced", random_state=RANDOM_STATE))

        def make_rf():
            return build_model_pipeline(RandomForestClassifier(
                n_estimators=800, max_depth=None, min_samples_split=5,
                min_samples_leaf=2, max_features="sqrt", class_weight="balanced",
                random_state=RANDOM_STATE, n_jobs=-1))

        def make_xgb():
            base = XGBClassifier(
                n_estimators=400, max_depth=4, learning_rate=0.05,
                subsample=0.8, colsample_bytree=0.8,
                scale_pos_weight=scale_pos_weight,
                reg_alpha=0.2, reg_lambda=1.5,
                tree_method="hist", eval_metric="auc",
                random_state=RANDOM_STATE, n_jobs=-1, verbosity=0)
            return build_model_pipeline(
                CalibratedClassifierCV(base, method="isotonic", cv=5))

        def make_lgb():
            return build_model_pipeline(LGBMClassifier(
                n_estimators=400, learning_rate=0.05, num_leaves=31,
                max_depth=-1, subsample=0.8, colsample_bytree=0.8,
                scale_pos_weight=scale_pos_weight,
                random_state=RANDOM_STATE, n_jobs=-1, verbose=-1))

        def make_cat():
            return build_catboost_pipeline(CatBoostClassifier(
                iterations=500, learning_rate=0.05, depth=6, l2_leaf_reg=3,
                eval_metric="AUC", task_type="CPU",
                class_weights=[1, scale_pos_weight],
                cat_features=cat_cols,
                random_seed=RANDOM_STATE, verbose=False, allow_writing_files=False))

        def make_stack():
            estimators = [
                ("rf", RandomForestClassifier(
                    n_estimators=800, min_samples_split=5, min_samples_leaf=2,
                    max_features="sqrt", class_weight="balanced",
                    random_state=RANDOM_STATE, n_jobs=-1)),
                ("log", Pipeline([
                    ("scaler", StandardScaler()),
                    ("model", LogisticRegression(class_weight="balanced", max_iter=1000)),
                ])),
            ]
            if HAS_LGB:
                estimators.append(("lgb", LGBMClassifier(
                    n_estimators=400, learning_rate=0.05, num_leaves=31,
                    scale_pos_weight=scale_pos_weight,
                    random_state=RANDOM_STATE, n_jobs=-1, verbose=-1)))
            return build_model_pipeline(StackingClassifier(
                estimators=estimators,
                final_estimator=LogisticRegression(class_weight="balanced", max_iter=1000),
                passthrough=False, n_jobs=-1))

        zoo = [
            ("Logistic Regression", 38, make_lr),
            ("Decision Tree", 44, make_dt),
            ("Random Forest", 50, make_rf),
        ]
        if HAS_XGB:
            zoo.append(("XGBoost (Calibrated)", 58, make_xgb))
        if HAS_LGB:
            zoo.append(("LightGBM", 66, make_lgb))
        if HAS_CAT:
            zoo.append(("CatBoost", 72, make_cat))
        zoo.append(("Stacked Model", 80, make_stack))

        # ── Validate + fit each model ────────────────────────────────────────
        model_results = []
        for name, pct, builder in zoo:
            progress(pct, f"Training {name} (out-of-fold validation)")
            try:
                res = _run_model(name, builder, X_train, y_train, X_test, y_test, skf,
                                 cost_fn, cost_fp)
                model_results.append(res)
                print(f"[pipeline] [OK] {name}: cv_auc={res['cv_mean']}, "
                      f"val_cost={res['cost']}, val_threshold={res['threshold']}")
            except Exception as e:
                print(f"[pipeline] [FAIL] {name} failed: {e}")
                traceback.print_exc()

        if not model_results:
            raise RuntimeError("All models failed to train")

        # ── Selection: lowest OUT-OF-FOLD cost. Test set untouched so far. ──
        progress(84, "Selecting best model on validation cost")
        best = min(model_results, key=lambda m: m["cost"])
        best_model_obj = best["_model_obj"]
        best_threshold = best["threshold"]
        best_oof = np.asarray(best["_oof_probs"], dtype=float)

        sorted_by_cost = sorted(model_results, key=lambda m: m["cost"])
        for m in model_results:
            if m["name"] == best["name"]:
                m["status"] = "Selected"
            elif m["name"] == sorted_by_cost[1]["name"]:
                m["status"] = "Runner-up"
            else:
                m["status"] = "Evaluated"

        # ── Final evaluation: the ONE look at the test set with locked choices
        probs_test_best = best.pop("_probs_test")
        y_pred_final = (probs_test_best >= best_threshold).astype(int)
        y_pred_default = (probs_test_best >= 0.5).astype(int)
        test_cost = business_cost(y_test, y_pred_final, cost_fn, cost_fp)
        test_cost_default = business_cost(y_test, y_pred_default, cost_fn, cost_fp)

        results["final_evaluation"] = {
            "model": best["name"],
            "threshold": best_threshold,
            "test_cost_at_threshold": test_cost,
            "test_cost_at_default_0_5": test_cost_default,
            "test_savings_vs_default": test_cost_default - test_cost,
            "test_roc_auc": round(float(roc_auc_score(y_test, probs_test_best)), 4),
            "test_confusion_matrix_at_threshold": confusion_matrix(y_test, y_pred_final).tolist(),
            "protocol": (
                "Model and threshold were selected on out-of-fold validation "
                "predictions over the training split only; the test set was "
                "evaluated once, here."
            ),
        }
        print(f"[pipeline] FINAL: {best['name']} @ t={best_threshold} -> "
              f"test_cost={test_cost} (default-0.5 cost {test_cost_default})")

        for m in model_results:
            m.pop("_model_obj", None)
            m.pop("_probs_test", None)
            m.pop("_oof_probs", None)

        results["models"] = model_results
        results["best_model"] = best["name"]
        results["best_threshold"] = best_threshold
        results["cost_fn"] = cost_fn
        results["cost_fp"] = cost_fp

        # ── Real cost-vs-threshold curve from the selected model's out-of-fold
        #    validation predictions. Persist (y_true, probs) so the
        #    /threshold-curve endpoint can recompute for any FN/FP cost the user
        #    enters, WITHOUT retraining. This replaces the frontend's fabricated
        #    sigmoid interpolation (AUDIT.md §4.B).
        results["validation_oof"] = {
            "model": best["name"],
            "y_true": [int(v) for v in y_train],
            "probs": [round(float(p), 6) for p in best_oof],
            "note": "Out-of-fold predictions over the training split (leakage-free).",
        }
        curve = cost_threshold_curve(y_train, best_oof, cost_fn, cost_fp)
        optimal_row = min(curve, key=lambda r: r["cost"])
        results["threshold_curve"] = {
            "source": "validation_oof",
            "model": best["name"],
            "cost_fn": cost_fn,
            "cost_fp": cost_fp,
            "curve": curve,
            "optimal": optimal_row,
            "locked_threshold": best_threshold,
        }
        results["cost_sensitivity"] = {
            "source": "validation_oof",
            "model": best["name"],
            "cost_fp": cost_fp,
            "points": cost_sensitivity_curve(y_train, best_oof, cost_fp),
        }

        # ── SHAP (global + per-customer), fixed label-based attribution ─────
        progress(88, "Computing SHAP values")
        feature_names = feature_names_of(best_model_obj)
        try:
            shap_vals, shap_names = _shap_matrix(best_model_obj, X_test, max_rows=100)
            mean_abs = np.abs(shap_vals).mean(axis=0)
            results["shap_global"] = [
                {"feature": f, "importance": round(float(v), 6)}
                for f, v in sorted(zip(shap_names, mean_abs), key=lambda x: -x[1])
            ]

            progress(93, "Computing per-customer SHAP values")
            customer_shap = []
            n_rows = shap_vals.shape[0]
            for i in range(n_rows):
                label = X_test.index[i]                     # original index LABEL
                row = df_clean.loc[label].to_dict()          # label-based lookup (§4.E)
                prob = float(probs_test_best[i])
                customer_shap.append({
                    "index": i,
                    "customer": {
                        k: (int(v) if isinstance(v, (np.integer, bool))
                            else float(v) if isinstance(v, np.floating)
                            else v)
                        for k, v in row.items()
                    },
                    "probability": round(prob, 4),
                    "prediction": int(prob >= best_threshold),
                    "risk_level": risk_level(prob, best_threshold),
                    "threshold_used": best_threshold,
                    "shap_values": {
                        shap_names[j]: round(float(shap_vals[i, j]), 6)
                        for j in range(len(shap_names))
                    },
                })
            results["customer_shap"] = customer_shap
        except Exception as e:
            print(f"[SHAP] failed: {e}")
            traceback.print_exc()
            results["shap_global"] = []
            results["customer_shap"] = []

        progress(97, "Finalising results")
        results["feature_names"] = feature_names
        results["dataset_info"] = {
            "total_rows": int(len(df)),
            "train_size": int(len(X_train)),
            "test_size": int(len(X_test)),
            "n_features": int(len(feature_names)),
            "churn_rate": round(float(y_all.mean()), 4),
        }

        # ── Serialize the winning pipeline as ONE artifact with metadata ────
        if artifact_path:
            progress(99, "Saving model artifact")
            prep = Pipeline(best_model_obj.steps[:-1])
            background = prep.transform(X_train.iloc[:100])
            if not isinstance(background, np.ndarray):
                background = None  # CatBoost pipeline: no numeric background
            else:
                background = background.astype(float)
            metadata = {
                "model_name": best["name"],
                "threshold": best_threshold,
                "feature_names": feature_names,
                "trained_at": datetime.now(timezone.utc).isoformat(),
                "git_commit": _git_commit(),
                "sklearn_version": sklearn.__version__,
                "cost_fn": cost_fn,
                "cost_fp": cost_fp,
                "final_evaluation": results["final_evaluation"],
                "shap_background": background,
            }
            save_artifact(artifact_path, best_model_obj, best_threshold, metadata)
            print(f"[pipeline] Artifact saved -> {artifact_path}")

        progress(100, "Pipeline complete")
        return results

    except Exception as e:
        raise RuntimeError(f"Pipeline failed: {e}\n{traceback.format_exc()}")

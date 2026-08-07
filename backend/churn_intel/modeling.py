"""modeling.py — out-of-fold validation, the model zoo, and SHAP helpers.

Correctness contract (Phase 1 fix pass, see AUDIT.md):
  * Every model is a single sklearn Pipeline (engineer -> encode -> model) built
    in features.py — the same object used verbatim at inference.
  * oof_probabilities() produces leakage-free validation predictions: every
    row's probability comes from a fold model that never saw that row.
"""

import logging
from typing import Callable

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier, StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score, average_precision_score, confusion_matrix, roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from .config import COST_FN, COST_FP, RANDOM_STATE
from .costs import find_best_threshold
from .features import build_catboost_pipeline, build_model_pipeline, feature_names_of

# shap is imported lazily inside _get_explainer so that importing this module —
# and therefore starting the FastAPI app — never requires shap to be installed.
logger = logging.getLogger(__name__)

# Optional boosting imports — gracefully degrade if not installed
try:
    from xgboost import XGBClassifier
    HAS_XGB = True
except ImportError:
    HAS_XGB = False
    logger.warning("xgboost not installed -- XGBoost model will be skipped")

try:
    from lightgbm import LGBMClassifier
    HAS_LGB = True
except ImportError:
    HAS_LGB = False
    logger.warning("lightgbm not installed -- LightGBM model will be skipped")

try:
    from catboost import CatBoostClassifier, Pool
    HAS_CAT = True
except ImportError:
    HAS_CAT = False
    logger.warning("catboost not installed -- CatBoost model will be skipped")


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


# ── Model zoo ────────────────────────────────────────────────────────────────
def build_model_zoo(scale_pos_weight: float, cat_cols: list[str]):
    """The candidate models as (name, progress_pct, builder) triples.

    Builders instead of instances because the OOF loop needs a clean unfitted
    model per fold (see oof_probabilities). `cat_cols` are the categorical
    columns after feature engineering (CatBoost consumes them natively).
    """
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
    return zoo


# ── SHAP ─────────────────────────────────────────────────────────────────────
def _get_explainer(model, X_background):
    """Pick the correct SHAP explainer for the FINAL estimator of a pipeline
    (inputs are already encoded)."""
    import shap  # lazy: only imported when SHAP is actually computed

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

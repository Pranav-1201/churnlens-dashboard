"""pipeline.py — run_pipeline() orchestration.

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

import logging
import traceback
import warnings
from datetime import datetime, timezone
from typing import Callable, Optional

import numpy as np
import pandas as pd
import sklearn
from sklearn.metrics import roc_auc_score
from sklearn.metrics import confusion_matrix
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline

from .artifacts import _git_commit, save_artifact
from .config import RANDOM_STATE
from .costs import (
    business_cost,
    cost_sensitivity_curve,
    cost_threshold_curve,
    derive_costs,
)
from .data import clean_data, compute_eda_summary
from .features import engineer_features, feature_names_of, risk_level
from .modeling import _run_model, _shap_matrix, build_model_zoo

logger = logging.getLogger(__name__)

warnings.filterwarnings("ignore")


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

        zoo = build_model_zoo(scale_pos_weight, cat_cols)

        # ── Validate + fit each model ────────────────────────────────────────
        model_results = []
        for name, pct, builder in zoo:
            progress(pct, f"Training {name} (out-of-fold validation)")
            try:
                res = _run_model(name, builder, X_train, y_train, X_test, y_test, skf,
                                 cost_fn, cost_fp)
                model_results.append(res)
                logger.info("[OK] %s: cv_auc=%s, val_cost=%s, val_threshold=%s",
                            name, res["cv_mean"], res["cost"], res["threshold"])
            except Exception as e:
                logger.exception("[FAIL] %s failed: %s", name, e)

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
        logger.info("FINAL: %s @ t=%s -> test_cost=%s (default-0.5 cost %s)",
                    best["name"], best_threshold, test_cost, test_cost_default)

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
            logger.exception("SHAP computation failed: %s", e)
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
            logger.info("Artifact saved -> %s", artifact_path)

        progress(100, "Pipeline complete")
        return results

    except Exception as e:
        raise RuntimeError(f"Pipeline failed: {e}\n{traceback.format_exc()}")

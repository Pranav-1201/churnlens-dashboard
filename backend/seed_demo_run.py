"""
seed_demo_run.py — produce a REAL warm-start run for the dashboard, fast.

Runs the actual pipeline's out-of-fold validation on the fast models only
(Logistic Regression, Random Forest, XGBoost, LightGBM) over a data file, then
writes models/last_run.json in the same shape the API persists. CatBoost and the
stacking ensemble are skipped here purely for speed — they deadlock when run in
FastAPI's background thread on this machine; the curve itself is genuine model
out-of-fold data either way.

    python backend/seed_demo_run.py [csv_path]
"""
import json
import os
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, average_precision_score,
                             confusion_matrix, roc_auc_score)
from sklearn.model_selection import StratifiedKFold, train_test_split

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from churn_intel.config import N_SPLITS, RANDOM_STATE, TEST_SIZE  # noqa: E402
from churn_intel.costs import (cost_sensitivity_curve, cost_threshold_curve,  # noqa: E402
                               derive_costs, find_best_threshold)
from churn_intel.data import clean_data, compute_eda_summary  # noqa: E402
from churn_intel.features import build_model_pipeline  # noqa: E402
from churn_intel.modeling import oof_probabilities  # noqa: E402

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, "data", "telco_demo_small.csv")
OUT = os.path.join(BASE, "models", "last_run.json")


def main():
    df = pd.read_csv(CSV)
    print(f"[seed] loaded {len(df)} rows from {CSV}")

    # Costs derived from the dataset (CLV-based), same as run_pipeline.
    COST_FN, COST_FP, cost_derivation = derive_costs(df)
    print(f"[seed] derived costs: FN={COST_FN} FP={COST_FP} "
          f"(avg_monthly={cost_derivation.get('avg_monthly_charges')}, "
          f"lifetime={cost_derivation.get('retained_lifetime_months')})")

    clean = clean_data(df)
    y = clean["Churn"].values.astype(int)
    X = clean.drop(columns=["Churn"])
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y)
    skf = StratifiedKFold(n_splits=N_SPLITS, shuffle=True, random_state=RANDOM_STATE)

    spw = float((y_tr == 0).sum() / (y_tr == 1).sum())
    builders = {
        "Logistic Regression": lambda: build_model_pipeline(
            LogisticRegression(max_iter=1000, class_weight="balanced", n_jobs=-1),
            scale_numeric=True),
        "Random Forest": lambda: build_model_pipeline(RandomForestClassifier(
            n_estimators=400, min_samples_split=5, min_samples_leaf=2,
            max_features="sqrt", class_weight="balanced",
            random_state=RANDOM_STATE, n_jobs=-1)),
    }
    try:
        from xgboost import XGBClassifier
        builders["XGBoost"] = lambda: build_model_pipeline(XGBClassifier(
            n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.8,
            colsample_bytree=0.8, scale_pos_weight=spw, tree_method="hist",
            eval_metric="auc", random_state=RANDOM_STATE, n_jobs=-1, verbosity=0))
    except ImportError:
        pass
    try:
        from lightgbm import LGBMClassifier
        builders["LightGBM"] = lambda: build_model_pipeline(LGBMClassifier(
            n_estimators=300, learning_rate=0.05, num_leaves=31,
            scale_pos_weight=spw, random_state=RANDOM_STATE, n_jobs=-1, verbose=-1))
    except ImportError:
        pass

    models, oof_store = [], {}
    for name, build in builders.items():
        print(f"[seed] out-of-fold: {name}")
        oof, aucs = oof_probabilities(build, X_tr, y_tr, skf)
        thr, val_cost = find_best_threshold(y_tr, oof, COST_FN, COST_FP)
        pipe = build(); pipe.fit(X_tr, y_tr)
        pt = pipe.predict_proba(X_te)[:, 1]
        yhat = (pt >= 0.5).astype(int)
        models.append({
            "name": name,
            "accuracy": round(accuracy_score(y_te, yhat), 4),
            "roc_auc": round(roc_auc_score(y_te, pt), 4),
            "pr_auc": round(average_precision_score(y_te, pt), 4),
            "cost": int(val_cost),
            "threshold": round(float(thr), 4),
            "cost_basis": "validation_oof",
            "confusion_matrix": confusion_matrix(y_te, yhat).tolist(),
            "cv_scores": [round(a, 4) for a in aucs],
            "cv_mean": round(float(np.mean(aucs)), 4),
            "cv_std": round(float(np.std(aucs)), 4),
        })
        oof_store[name] = oof

    best = min(models, key=lambda m: m["cost"])
    ranked = sorted(models, key=lambda m: m["cost"])
    for m in models:
        m["status"] = ("Selected" if m["name"] == best["name"]
                       else "Runner-up" if m["name"] == ranked[1]["name"] else "Evaluated")

    best_oof = oof_store[best["name"]]
    curve = cost_threshold_curve(y_tr, best_oof, COST_FN, COST_FP)
    optimal = min(curve, key=lambda r: r["cost"])

    results = {
        "models": models,
        "best_model": best["name"],
        "best_threshold": best["threshold"],
        "cost_fn": COST_FN,
        "cost_fp": COST_FP,
        "validation_oof": {
            "model": best["name"],
            "y_true": [int(v) for v in y_tr],
            "probs": [round(float(p), 6) for p in best_oof],
            "note": "Out-of-fold predictions over the training split (leakage-free).",
        },
        "threshold_curve": {
            "source": "validation_oof", "model": best["name"],
            "cost_fn": COST_FN, "cost_fp": COST_FP,
            "curve": curve, "optimal": optimal,
            "locked_threshold": best["threshold"],
        },
        "cost_sensitivity": {
            "source": "validation_oof", "model": best["name"],
            "cost_fp": COST_FP,
            "points": cost_sensitivity_curve(y_tr, best_oof, COST_FP),
        },
        "cost_derivation": cost_derivation,
        "eda": compute_eda_summary(df),
        "dataset_info": {
            "total_rows": int(len(df)), "train_size": int(len(X_tr)),
            "test_size": int(len(X_te)), "n_features": len(X.columns),
            "churn_rate": round(float(y.mean()), 4),
        },
        "shap_global": [],
        "customer_shap": [],
        "seed_note": "Warm-start seed (fast models only; CatBoost/Stacking skipped for speed).",
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(results, f)
    print(f"[seed] wrote {OUT}")
    print(f"[seed] selected {best['name']} @ t={best['threshold']} "
          f"(val cost {best['cost']:,}); optimal curve point t={optimal['threshold']} "
          f"cost {optimal['cost']:,}")


if __name__ == "__main__":
    main()

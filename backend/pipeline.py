"""
pipeline.py  -- ChurnLens (FULLY FIXED to match notebook)

Fixes applied:
  1. Feature engineering EXACTLY matches notebook Section 6
  2. Encoding matches notebook Section 7 (pd.get_dummies on full df)
  3. NO global StandardScaler -- LR uses Pipeline scaler, trees use raw data
  4. XGBoost params match notebook Section 13 (with early stopping + calibration)
  5. All model hyperparams match notebook exactly
  6. Cost search uses np.linspace(0.01, 0.99, 50)
  7. LightGBM retrains on full train data like notebook
  8. Stacking uses RF + LR(pipeline) + LGB like notebook
"""

import pandas as pd
import numpy as np
import warnings
import traceback
from typing import Callable, Optional

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier, StackingClassifier
from sklearn.metrics import (
    accuracy_score, roc_auc_score, average_precision_score,
    confusion_matrix,
)
from sklearn.calibration import CalibratedClassifierCV
from sklearn.pipeline import Pipeline, make_pipeline
import shap

# Optional boosting imports -- gracefully degrade if not installed
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
    from catboost import CatBoostClassifier
    HAS_CAT = True
except ImportError:
    HAS_CAT = False
    print("[WARNING] catboost not installed -- CatBoost model will be skipped")

warnings.filterwarnings("ignore")

COST_FN = 10_000
COST_FP = 500


# -- Data cleaning ------------------------------------
def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Validate required columns
    REQUIRED_COLUMNS = ["tenure", "MonthlyCharges", "TotalCharges", "Churn"]
    missing_required = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_required:
        raise ValueError(
            f"Dataset is missing required column(s): {', '.join(missing_required)}. "
            f"The pipeline requires these columns: {', '.join(REQUIRED_COLUMNS)}. "
            f"Please check your CSV file and ensure these columns exist."
        )

    # Match notebook Section 5 exactly:
    # 1. Convert TotalCharges to numeric
    if "TotalCharges" in df.columns:
        df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce")
        # Set TotalCharges = 0 where tenure = 0
        df.loc[df["tenure"] == 0, "TotalCharges"] = 0
        # Fill remaining NaN with median
        df["TotalCharges"] = df["TotalCharges"].fillna(df["TotalCharges"].median())

    # 2. Encode Churn
    if "Churn" in df.columns:
        df["Churn"] = df["Churn"].map({"Yes": 1, "No": 0})
        df = df[df["Churn"].notna()]

    # 3. Drop customerID
    if "customerID" in df.columns:
        df.drop(columns=["customerID"], inplace=True)

    print("DEBUG: rows after cleaning =", len(df))
    return df


# -- Feature engineering -- EXACTLY matches notebook Section 6 --
def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # 1. Tenure-based features
    # Notebook: df['Tenure_to_Charges'] = df['tenure'] / (df['MonthlyCharges'] + 1)
    df["Tenure_to_Charges"] = df["tenure"] / (df["MonthlyCharges"] + 1)

    # Notebook: TenureGroup with bins=[-1, 12, 24, 48, 72]
    df["TenureGroup"] = pd.cut(
        df["tenure"],
        bins=[-1, 12, 24, 48, 72],
        labels=["New", "Short-Term", "Mid-Term", "Long-Term"],
    )

    # 2. Customer value features
    df["AvgMonthlyCharge"] = df["TotalCharges"] / (df["tenure"] + 1)
    df["HighSpender"] = (df["MonthlyCharges"] > 80).astype(int)

    # 3. Service usage features -- notebook uses EXACTLY these 6 columns
    df["ServiceCount"] = (
        (df["OnlineSecurity"] == "Yes").astype(int) +
        (df["OnlineBackup"] == "Yes").astype(int) +
        (df["DeviceProtection"] == "Yes").astype(int) +
        (df["TechSupport"] == "Yes").astype(int) +
        (df["StreamingTV"] == "Yes").astype(int) +
        (df["StreamingMovies"] == "Yes").astype(int)
    )
    df["LowEngagement"] = (df["ServiceCount"] <= 2).astype(int)

    # 4. Contract & Internet features
    if "Contract" in df.columns:
        df["IsMonthToMonth"] = (df["Contract"] == "Month-to-month").astype(int)
    else:
        df["IsMonthToMonth"] = 0
    if "InternetService" in df.columns:
        df["FiberUser"] = (df["InternetService"] == "Fiber optic").astype(int)
    else:
        df["FiberUser"] = 0

    return df


# -- Encoding -- EXACTLY matches notebook Section 7 ---------
def encode_features(df: pd.DataFrame):
    """
    Notebook does:
      df_encoded = pd.get_dummies(df, drop_first=True)
      X = df_encoded.drop('Churn', axis=1)
      y = df_encoded['Churn']
      X.columns = X.columns.str.replace(" ", "_")
    """
    # One-hot encode the FULL dataframe (including Churn) to match notebook
    df_encoded = pd.get_dummies(df, drop_first=True)

    # Convert bool columns to int
    bool_cols = df_encoded.select_dtypes(include=["bool"]).columns
    df_encoded[bool_cols] = df_encoded[bool_cols].astype(int)

    # Split X and y
    target = "Churn"
    X = df_encoded.drop(columns=[target])
    y = df_encoded[target].values

    # Clean feature names (match notebook)
    X.columns = X.columns.str.replace(" ", "_")

    feature_names = list(X.columns)

    return X, y, feature_names


# -- Threshold search -- EXACTLY matches notebook Section 26 --
def find_best_threshold(y_true, y_prob, cost_fn=COST_FN, cost_fp=COST_FP):
    best_thresh, best_cost = 0.5, float("inf")
    for t in np.linspace(0.01, 0.99, 50):
        preds = (y_prob >= t).astype(int)
        cm = confusion_matrix(y_true, preds)
        if cm.shape != (2, 2):
            continue
        tn, fp, fn, tp = cm.ravel()
        cost = fn * cost_fn + fp * cost_fp
        if cost < best_cost:
            best_cost = cost
            best_thresh = t
    return best_thresh, best_cost


# -- SHAP explainer selection -----------------
def _get_explainer(model, X_background):
    """
    Pick the correct SHAP explainer based on model type.
    """
    if isinstance(model, Pipeline):
        # Unwrap pipeline to get the raw model
        inner = model.named_steps.get("model", model)
        if isinstance(inner, LogisticRegression):
            return shap.LinearExplainer(
                inner, model.named_steps["scaler"].transform(X_background),
                feature_perturbation="interventional"
            )

    if isinstance(model, LogisticRegression):
        return shap.LinearExplainer(
            model, X_background, feature_perturbation="interventional"
        )
    elif isinstance(model, (RandomForestClassifier, DecisionTreeClassifier)):
        return shap.TreeExplainer(model)
    elif HAS_XGB and isinstance(model, XGBClassifier):
        return shap.TreeExplainer(model)
    elif HAS_LGB and isinstance(model, LGBMClassifier):
        return shap.TreeExplainer(model)
    elif HAS_CAT and isinstance(model, CatBoostClassifier):
        return shap.TreeExplainer(model)
    else:
        # Stacking, calibrated, etc.
        bg = X_background[:50] if len(X_background) > 50 else X_background
        return shap.KernelExplainer(
            lambda x: model.predict_proba(x)[:, 1], bg
        )


# -- SHAP global --------------------------------------
def compute_shap_global(model, X, feature_names, max_samples=200):
    try:
        sample = X[:max_samples] if len(X) > max_samples else X
        explainer = _get_explainer(model, sample)
        shap_vals = explainer.shap_values(sample)
        if isinstance(shap_vals, list):
            shap_vals = shap_vals[1]
        mean_abs = np.abs(shap_vals).mean(axis=0)
        return [
            {"feature": f, "importance": round(float(v), 6)}
            for f, v in sorted(zip(feature_names, mean_abs), key=lambda x: -x[1])
        ]
    except Exception as e:
        print(f"[SHAP global] fallback zeros: {e}")
        return [{"feature": f, "importance": 0.0} for f in feature_names]


# -- EDA summary --------------------------------------
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


# -- Main entry point ---------------------------------
def run_pipeline(
    df: pd.DataFrame,
    progress_callback: Optional[Callable[[int, str], None]] = None,
) -> dict:
    def progress(pct: int, msg: str):
        if progress_callback:
            progress_callback(pct, msg)

    results = {}

    try:
        progress(5, "Computing EDA summary")
        results["eda"] = compute_eda_summary(df)

        progress(12, "Cleaning data")
        df_clean = clean_data(df)

        if len(df_clean) == 0:
            raise ValueError("Dataset became empty after cleaning")

        progress(22, "Engineering features")
        df_feat = engineer_features(df_clean)

        progress(30, "Encoding categorical features")
        X, y, feature_names = encode_features(df_feat)

        if len(X) == 0:
            raise ValueError("Dataset became empty after encoding")

        progress(35, "Splitting train / test sets")
        # Notebook: train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        # X is a DataFrame here (matching notebook)
        X_train, X_test, y_train, y_test = train_test_split(
            X, y,
            test_size=0.2,
            random_state=42,
            stratify=y,
        )

        # Store indices for SHAP per-customer lookup
        idx_test = X_test.index.values

        # Convert to numpy for model training (after preserving indices)
        X_train_np = X_train.values.astype(float)
        X_test_np = X_test.values.astype(float)

        # Handle any NaN from encoding
        from sklearn.impute import SimpleImputer
        imputer = SimpleImputer(strategy="median")
        X_train_np = imputer.fit_transform(X_train_np)
        X_test_np = imputer.transform(X_test_np)

        # -- Scale ONLY for models that need it (LR uses Pipeline scaler) --
        # Notebook: scaler = StandardScaler(); X_train_scaled = scaler.fit_transform(X_train)
        # But ONLY used for ANN. All sklearn models train on UNSCALED data.
        # LR wraps its own StandardScaler inside a Pipeline.
        progress(36, "Preparing data")
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train_np)
        X_test_scaled = scaler.transform(X_test_np)

        # Compute class imbalance weight for XGBoost/LightGBM
        num_negative = (y_train == 0).sum()
        num_positive = (y_train == 1).sum()
        scale_pos_weight = num_negative / num_positive

        model_results = []

        # ==============================================
        # MODEL 1: Logistic Regression (notebook Section 10)
        # Uses Pipeline with StandardScaler -- trains on UNSCALED data
        # ==============================================
        progress(38, "Training Logistic Regression")
        try:
            log_pipeline = Pipeline([
                ('scaler', StandardScaler()),
                ('model', LogisticRegression(
                    max_iter=1000,
                    class_weight='balanced',
                    n_jobs=-1
                ))
            ])
            log_pipeline.fit(X_train_np, y_train)
            y_prob = log_pipeline.predict_proba(X_test_np)[:, 1]
            threshold, cost = find_best_threshold(y_test, y_prob)

            # Accuracy at 0.5 (notebook uses model.predict which defaults to 0.5)
            y_pred_default = log_pipeline.predict(X_test_np)
            cm = confusion_matrix(y_test, y_pred_default).tolist()
            acc = round(accuracy_score(y_test, y_pred_default), 4)
            auc = round(roc_auc_score(y_test, y_prob), 4)
            pr = round(average_precision_score(y_test, y_prob), 4)

            skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
            cv = cross_val_score(log_pipeline, X_train_np, y_train, cv=skf, scoring="roc_auc", n_jobs=-1)

            model_results.append({
                "name": "Logistic Regression",
                "accuracy": acc, "roc_auc": auc, "pr_auc": pr,
                "cost": int(cost), "threshold": threshold,
                "confusion_matrix": cm,
                "cv_scores": [round(float(s), 4) for s in cv],
                "cv_mean": round(float(cv.mean()), 4),
                "cv_std": round(float(cv.std()), 4),
                "_model_obj": log_pipeline,
            })
            print(f"[pipeline] [OK] Logistic Regression: AUC={auc}, Cost={int(cost)}")
        except Exception as e:
            print(f"[pipeline] [FAIL] Logistic Regression failed: {e}")
            traceback.print_exc()

        # ==============================================
        # MODEL 2: Decision Tree (notebook Section 11)
        # Trains on UNSCALED data
        # ==============================================
        progress(43, "Training Decision Tree")
        try:
            dt_model = DecisionTreeClassifier(
                max_depth=6, min_samples_split=10, min_samples_leaf=5,
                class_weight='balanced', random_state=42
            )
            dt_model.fit(X_train_np, y_train)
            y_prob = dt_model.predict_proba(X_test_np)[:, 1]
            threshold, cost = find_best_threshold(y_test, y_prob)

            y_pred_default = dt_model.predict(X_test_np)
            cm = confusion_matrix(y_test, y_pred_default).tolist()
            acc = round(accuracy_score(y_test, y_pred_default), 4)
            auc = round(roc_auc_score(y_test, y_prob), 4)
            pr = round(average_precision_score(y_test, y_prob), 4)

            skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
            cv = cross_val_score(dt_model, X_train_np, y_train, cv=skf, scoring="roc_auc", n_jobs=-1)

            model_results.append({
                "name": "Decision Tree",
                "accuracy": acc, "roc_auc": auc, "pr_auc": pr,
                "cost": int(cost), "threshold": threshold,
                "confusion_matrix": cm,
                "cv_scores": [round(float(s), 4) for s in cv],
                "cv_mean": round(float(cv.mean()), 4),
                "cv_std": round(float(cv.std()), 4),
                "_model_obj": dt_model,
            })
            print(f"[pipeline] [OK] Decision Tree: AUC={auc}, Cost={int(cost)}")
        except Exception as e:
            print(f"[pipeline] [FAIL] Decision Tree failed: {e}")
            traceback.print_exc()

        # ==============================================
        # MODEL 3: Random Forest (notebook Section 12)
        # Trains on UNSCALED data
        # ==============================================
        progress(48, "Training Random Forest")
        try:
            rf_weighted = RandomForestClassifier(
                n_estimators=800, max_depth=None,
                min_samples_split=5, min_samples_leaf=2,
                max_features='sqrt', class_weight='balanced',
                oob_score=True, random_state=42, n_jobs=-1
            )
            rf_weighted.fit(X_train_np, y_train)
            y_prob = rf_weighted.predict_proba(X_test_np)[:, 1]
            threshold, cost = find_best_threshold(y_test, y_prob)

            y_pred_default = rf_weighted.predict(X_test_np)
            cm = confusion_matrix(y_test, y_pred_default).tolist()
            acc = round(accuracy_score(y_test, y_pred_default), 4)
            auc = round(roc_auc_score(y_test, y_prob), 4)
            pr = round(average_precision_score(y_test, y_prob), 4)

            skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
            cv = cross_val_score(rf_weighted, X_train_np, y_train, cv=skf, scoring="roc_auc", n_jobs=-1)

            model_results.append({
                "name": "Random Forest",
                "accuracy": acc, "roc_auc": auc, "pr_auc": pr,
                "cost": int(cost), "threshold": threshold,
                "confusion_matrix": cm,
                "cv_scores": [round(float(s), 4) for s in cv],
                "cv_mean": round(float(cv.mean()), 4),
                "cv_std": round(float(cv.std()), 4),
                "_model_obj": rf_weighted,
            })
            print(f"[pipeline] [OK] Random Forest: AUC={auc}, Cost={int(cost)}")
        except Exception as e:
            print(f"[pipeline] [FAIL] Random Forest failed: {e}")
            traceback.print_exc()

        # ==============================================
        # MODEL 4: XGBoost Calibrated (notebook Section 13)
        # Uses early stopping to find best_iter, then CalibratedClassifierCV
        # Trains on UNSCALED data
        # ==============================================
        xgb_model = None
        if HAS_XGB:
            progress(53, "Training XGBoost (Calibrated)")
            try:
                xgb_params = dict(
                    n_estimators=400, max_depth=4, learning_rate=0.05,
                    subsample=0.8, colsample_bytree=0.8,
                    scale_pos_weight=scale_pos_weight,
                    reg_alpha=0.2, reg_lambda=1.5,
                    tree_method="hist", eval_metric="auc",
                    random_state=42, n_jobs=-1
                )

                # Early stopping to find best iteration
                X_train_xgb, X_val_xgb, y_train_xgb, y_val_xgb = train_test_split(
                    X_train_np, y_train, test_size=0.2,
                    stratify=y_train, random_state=42
                )
                xgb_temp = XGBClassifier(**xgb_params, early_stopping_rounds=50, verbosity=0)
                xgb_temp.fit(X_train_xgb, y_train_xgb,
                             eval_set=[(X_val_xgb, y_val_xgb)], verbose=False)
                best_iter = xgb_temp.best_iteration
                print(f"[pipeline] XGBoost best iteration: {best_iter}")

                # Final base model with best_iter estimators
                base_xgb = XGBClassifier(
                    n_estimators=best_iter, max_depth=4, learning_rate=0.05,
                    subsample=0.8, colsample_bytree=0.8,
                    scale_pos_weight=scale_pos_weight,
                    reg_alpha=0.2, reg_lambda=1.5,
                    tree_method="hist", eval_metric="auc",
                    random_state=42, n_jobs=-1, verbosity=0
                )
                base_xgb.fit(X_train_np, y_train)

                # Probability calibration
                xgb_model = CalibratedClassifierCV(base_xgb, method="isotonic", cv=5)
                xgb_model.fit(X_train_np, y_train)

                y_prob = xgb_model.predict_proba(X_test_np)[:, 1]
                threshold, cost = find_best_threshold(y_test, y_prob)

                y_pred_default = xgb_model.predict(X_test_np)
                cm = confusion_matrix(y_test, y_pred_default).tolist()
                acc = round(accuracy_score(y_test, y_pred_default), 4)
                auc = round(roc_auc_score(y_test, y_prob), 4)
                pr = round(average_precision_score(y_test, y_prob), 4)

                skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
                cv = cross_val_score(
                    XGBClassifier(**xgb_params, verbosity=0),
                    X_train_np, y_train, cv=skf, scoring="roc_auc", n_jobs=-1
                )

                model_results.append({
                    "name": "XGBoost (Calibrated)",
                    "accuracy": acc, "roc_auc": auc, "pr_auc": pr,
                    "cost": int(cost), "threshold": threshold,
                    "confusion_matrix": cm,
                    "cv_scores": [round(float(s), 4) for s in cv],
                    "cv_mean": round(float(cv.mean()), 4),
                    "cv_std": round(float(cv.std()), 4),
                    "_model_obj": xgb_model,
                })
                print(f"[pipeline] [OK] XGBoost (Calibrated): AUC={auc}, Cost={int(cost)}")
            except Exception as e:
                print(f"[pipeline] [FAIL] XGBoost failed: {e}")
                traceback.print_exc()

        # ==============================================
        # MODEL 5: LightGBM (notebook Section 14)
        # trains on UNSCALED data, retrains on full train after early stopping
        # ==============================================
        lgb_model = None
        if HAS_LGB:
            progress(60, "Training LightGBM")
            try:
                lgb_params = dict(
                    n_estimators=400, learning_rate=0.05,
                    num_leaves=31, max_depth=-1,
                    subsample=0.8, colsample_bytree=0.8,
                    scale_pos_weight=scale_pos_weight,
                    random_state=42, n_jobs=-1, verbose=-1
                )

                # Early stopping split
                X_train_lgb, X_val_lgb, y_train_lgb, y_val_lgb = train_test_split(
                    X_train_np, y_train, test_size=0.2,
                    stratify=y_train, random_state=42
                )
                lgb_temp = LGBMClassifier(**lgb_params)
                lgb_temp.fit(X_train_lgb, y_train_lgb,
                             eval_set=[(X_val_lgb, y_val_lgb)],
                             eval_metric='auc')

                # Retrain on full train data (critical -- matches notebook)
                lgb_model = LGBMClassifier(**lgb_params)
                lgb_model.fit(X_train_np, y_train)

                y_prob = lgb_model.predict_proba(X_test_np)[:, 1]
                threshold, cost = find_best_threshold(y_test, y_prob)

                y_pred_default = lgb_model.predict(X_test_np)
                cm = confusion_matrix(y_test, y_pred_default).tolist()
                acc = round(accuracy_score(y_test, y_pred_default), 4)
                auc = round(roc_auc_score(y_test, y_prob), 4)
                pr = round(average_precision_score(y_test, y_prob), 4)

                skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
                cv = cross_val_score(LGBMClassifier(**lgb_params),
                                     X_train_np, y_train, cv=skf, scoring="roc_auc", n_jobs=-1)

                model_results.append({
                    "name": "LightGBM",
                    "accuracy": acc, "roc_auc": auc, "pr_auc": pr,
                    "cost": int(cost), "threshold": threshold,
                    "confusion_matrix": cm,
                    "cv_scores": [round(float(s), 4) for s in cv],
                    "cv_mean": round(float(cv.mean()), 4),
                    "cv_std": round(float(cv.std()), 4),
                    "_model_obj": lgb_model,
                })
                print(f"[pipeline] [OK] LightGBM: AUC={auc}, Cost={int(cost)}")
            except Exception as e:
                print(f"[pipeline] [FAIL] LightGBM failed: {e}")
                traceback.print_exc()

        # ==============================================
        # MODEL 6: CatBoost (notebook Section 15)
        # Uses raw categorical features, NOT one-hot encoded
        # ==============================================
        if HAS_CAT:
            progress(66, "Training CatBoost")
            try:
                # CatBoost uses raw categorical data (df_feat, not encoded)
                df_for_cat = df_feat.copy()
                X_cat = df_for_cat.drop("Churn", axis=1)
                y_cat = df_for_cat["Churn"].values

                cat_feature_cols = X_cat.select_dtypes(include=["object", "category"]).columns.tolist()
                for col in cat_feature_cols:
                    X_cat[col] = X_cat[col].astype(str).fillna("Missing")

                # Use same train/test indices
                X_cat_train = X_cat.iloc[X_train.index] if hasattr(X_train, 'index') else X_cat.iloc[:len(X_train_np)]
                X_cat_test = X_cat.iloc[X_test.index] if hasattr(X_test, 'index') else X_cat.iloc[len(X_train_np):]

                # Reindex to match the original df's indices
                X_cat_train = X_cat.loc[X_train.index]
                X_cat_test = X_cat.loc[X_test.index]

                class_weights = [1, scale_pos_weight]

                import torch
                gpu_available = torch.cuda.is_available()

                cat_params = dict(
                    iterations=500, learning_rate=0.05, depth=6,
                    l2_leaf_reg=3, eval_metric="AUC",
                    task_type="GPU" if gpu_available else "CPU",
                    class_weights=class_weights,
                    random_seed=42, verbose=False
                )

                # Early stopping split
                X_cat_train_final, X_cat_val, y_cat_train_final, y_cat_val = train_test_split(
                    X_cat_train, y_train, test_size=0.2,
                    stratify=y_train, random_state=42
                )

                cat_model = CatBoostClassifier(**cat_params)
                cat_model.fit(
                    X_cat_train_final, y_cat_train_final,
                    cat_features=cat_feature_cols,
                    eval_set=(X_cat_val, y_cat_val),
                    early_stopping_rounds=50,
                    verbose=False
                )

                y_prob = cat_model.predict_proba(X_cat_test)[:, 1]
                threshold, cost = find_best_threshold(y_test, y_prob)

                y_pred_default = cat_model.predict(X_cat_test)
                # CatBoost predict returns strings or ints depending on version
                y_pred_default = np.array(y_pred_default).astype(int)
                cm = confusion_matrix(y_test, y_pred_default).tolist()
                acc = round(accuracy_score(y_test, y_pred_default), 4)
                auc = round(roc_auc_score(y_test, y_prob), 4)
                pr = round(average_precision_score(y_test, y_prob), 4)

                # CatBoost CV (manual, like notebook)
                cat_auc_scores = []
                skf_cat = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
                for train_idx, val_idx in skf_cat.split(X_cat, y):
                    X_fold_train = X_cat.iloc[train_idx]
                    X_fold_val = X_cat.iloc[val_idx]
                    y_fold_train = y[train_idx]
                    y_fold_val = y[val_idx]
                    m = CatBoostClassifier(**cat_params)
                    m.fit(X_fold_train, y_fold_train, cat_features=cat_feature_cols, verbose=False)
                    preds = m.predict_proba(X_fold_val)[:, 1]
                    cat_auc_scores.append(roc_auc_score(y_fold_val, preds))
                cv_arr = np.array(cat_auc_scores)

                model_results.append({
                    "name": "CatBoost",
                    "accuracy": acc, "roc_auc": auc, "pr_auc": pr,
                    "cost": int(cost), "threshold": threshold,
                    "confusion_matrix": cm,
                    "cv_scores": [round(float(s), 4) for s in cv_arr],
                    "cv_mean": round(float(cv_arr.mean()), 4),
                    "cv_std": round(float(cv_arr.std()), 4),
                    "_model_obj": cat_model,
                })
                print(f"[pipeline] [OK] CatBoost: AUC={auc}, Cost={int(cost)}")
            except Exception as e:
                print(f"[pipeline] [FAIL] CatBoost failed: {e}")
                traceback.print_exc()

        # ==============================================
        # MODEL 7: Stacking (notebook Section 16)
        # Uses RF + LR(pipeline) + LGB as base estimators
        # ==============================================
        progress(72, "Training Stacked Model")
        try:
            estimators = [
                ('rf', rf_weighted if 'rf_weighted' in dir() else RandomForestClassifier(
                    n_estimators=800, class_weight='balanced', random_state=42, n_jobs=-1)),
                ('log', make_pipeline(
                    StandardScaler(),
                    LogisticRegression(class_weight='balanced', max_iter=1000)
                )),
            ]
            if lgb_model is not None:
                estimators.append(('lgb', lgb_model))

            stack_model = StackingClassifier(
                estimators=estimators,
                final_estimator=LogisticRegression(class_weight='balanced', max_iter=1000),
                passthrough=False,
                n_jobs=-1,
            )
            stack_model.fit(X_train_np, y_train)
            y_prob = stack_model.predict_proba(X_test_np)[:, 1]
            threshold, cost = find_best_threshold(y_test, y_prob)

            y_pred_default = stack_model.predict(X_test_np)
            cm = confusion_matrix(y_test, y_pred_default).tolist()
            acc = round(accuracy_score(y_test, y_pred_default), 4)
            auc = round(roc_auc_score(y_test, y_prob), 4)
            pr = round(average_precision_score(y_test, y_prob), 4)

            skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
            cv = cross_val_score(stack_model, X_train_np, y_train, cv=skf, scoring="roc_auc", n_jobs=-1)

            model_results.append({
                "name": "Stacked Model",
                "accuracy": acc, "roc_auc": auc, "pr_auc": pr,
                "cost": int(cost), "threshold": threshold,
                "confusion_matrix": cm,
                "cv_scores": [round(float(s), 4) for s in cv],
                "cv_mean": round(float(cv.mean()), 4),
                "cv_std": round(float(cv.std()), 4),
                "_model_obj": stack_model,
            })
            print(f"[pipeline] [OK] Stacked Model: AUC={auc}, Cost={int(cost)}")
        except Exception as e:
            print(f"[pipeline] [FAIL] Stacked Model failed: {e}")
            traceback.print_exc()

        if not model_results:
            raise RuntimeError("All models failed to train")

        # -- Tuned Logistic will be added later (needs Optuna fix) --

        progress(80, "Selecting best model")
        best = min(model_results, key=lambda m: m["cost"])
        best_model_obj = best["_model_obj"]
        best_threshold = best["threshold"]

        sorted_by_cost = sorted(model_results, key=lambda m: m["cost"])

        for m in model_results:
            if m["name"] == best["name"]:
                m["status"] = "Selected"
            elif m["name"] == sorted_by_cost[1]["name"]:
                m["status"] = "Runner-up"
            else:
                m["status"] = "Evaluated"

        for m in model_results:
            m.pop("_model_obj", None)

        results["models"] = model_results
        results["best_model"] = best["name"]
        results["best_threshold"] = best_threshold
        results["cost_fn"] = COST_FN
        results["cost_fp"] = COST_FP

        progress(85, "Computing SHAP global importances")

        inner_model = best_model_obj
        X_shap = X_test_np

        results["shap_global"] = compute_shap_global(inner_model, X_shap, feature_names)

        progress(92, "Computing per-customer SHAP values")

        try:
            explainer = _get_explainer(inner_model, X_shap)
            shap_vals = explainer.shap_values(X_shap)

            if isinstance(shap_vals, list):
                shap_vals = shap_vals[1]

            y_prob_all = best_model_obj.predict_proba(X_test_np)[:, 1]
            df_clean_reset = df_clean.reset_index(drop=True)
            customer_shap = []

            for i in range(min(len(X_test_np), 100)):
                original_idx = idx_test[i]
                row = (
                    df_clean_reset.iloc[original_idx].to_dict()
                    if original_idx < len(df_clean_reset)
                    else {}
                )

                prob = float(y_prob_all[i])
                pred = int(prob >= best_threshold)

                sv = {
                    feature_names[j]: round(float(shap_vals[i, j]), 6)
                    for j in range(len(feature_names))
                }

                customer_shap.append({
                    "index": i,
                    "customer": {
                        k: (
                            int(v) if isinstance(v, np.integer)
                            else float(v) if isinstance(v, np.floating)
                            else v
                        )
                        for k, v in row.items()
                    },
                    "probability": round(prob, 4),
                    "prediction": pred,
                    "risk_level": "HIGH RISK" if prob >= best_threshold else "LOW RISK",
                    "threshold_used": best_threshold,
                    "shap_values": sv,
                })

            results["customer_shap"] = customer_shap

        except Exception as e:
            print(f"[SHAP per-customer] failed: {e}")
            results["customer_shap"] = []

        progress(97, "Finalising results")

        results["feature_names"] = feature_names
        results["dataset_info"] = {
            "total_rows": int(len(df)),
            "train_size": int(len(X_train_np)),
            "test_size": int(len(X_test_np)),
            "n_features": int(len(feature_names)),
            "churn_rate": round(float(y.mean()), 4),
        }

        progress(100, "Pipeline complete")
        return results

    except Exception as e:
        raise RuntimeError(f"Pipeline failed: {e}\n{traceback.format_exc()}")
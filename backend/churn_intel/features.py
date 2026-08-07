"""features.py — the single canonical path from a raw customer row to model-ready features.

Everything that turns raw Telco columns into model inputs lives here and ONLY here:
  * engineer_features()      — engineered columns (pure function, picklable)
  * build_model_pipeline()   — engineer -> encode (ColumnTransformer) -> model
  * build_catboost_pipeline()— engineer -> stringify -> CatBoost (native categoricals)
  * risk_level()             — risk bands derived from the actual decision threshold

Both training (pipeline.py / train.py) and inference (inference.py) use the same
fitted sklearn Pipeline object, so train/inference encoding can never diverge
(AUDIT.md §3.A / brief bug #8).

NOTE: the flat shim backend/features.py must stay importable as `features`
wherever a pre-restructure artifact is unpickled (that pipeline stores a
reference to `features.engineer_features`). Artifacts trained after the
restructure reference `churn_intel.features.engineer_features` instead.
"""

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer, make_column_selector
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler

SERVICE_COLUMNS = [
    "OnlineSecurity", "OnlineBackup", "DeviceProtection",
    "TechSupport", "StreamingTV", "StreamingMovies",
]

NUMERIC_INPUT_COLUMNS = ["tenure", "MonthlyCharges", "TotalCharges"]


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add engineered columns. Pure, row-wise independent, safe for 1..n rows."""
    df = df.copy()

    for col in NUMERIC_INPUT_COLUMNS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    df["Tenure_to_Charges"] = df["tenure"] / (df["MonthlyCharges"] + 1)

    df["TenureGroup"] = pd.cut(
        df["tenure"],
        bins=[-1, 12, 24, 48, 72],
        labels=["New", "Short-Term", "Mid-Term", "Long-Term"],
    )

    df["AvgMonthlyCharge"] = df["TotalCharges"] / (df["tenure"] + 1)
    df["HighSpender"] = (df["MonthlyCharges"] > 80).astype(int)

    count = pd.Series(0, index=df.index)
    for col in SERVICE_COLUMNS:
        if col in df.columns:
            count = count + (df[col] == "Yes").astype(int)
    df["ServiceCount"] = count
    df["LowEngagement"] = (df["ServiceCount"] <= 2).astype(int)

    df["IsMonthToMonth"] = (
        (df["Contract"] == "Month-to-month").astype(int) if "Contract" in df.columns else 0
    )
    df["FiberUser"] = (
        (df["InternetService"] == "Fiber optic").astype(int) if "InternetService" in df.columns else 0
    )

    return df


def stringify_categoricals(df: pd.DataFrame) -> pd.DataFrame:
    """CatBoost needs its categorical columns as plain strings without NaN."""
    df = df.copy()
    for col in df.select_dtypes(include=["object", "category"]).columns:
        df[col] = df[col].astype("object").where(df[col].notna(), "Missing").astype(str)
    return df


def make_encoder(scale_numeric: bool = False) -> ColumnTransformer:
    """Encode whatever comes out of engineer_features: numerics pass through
    (optionally scaled), everything else is one-hot encoded.

    handle_unknown="ignore" means an unseen category at inference becomes an
    all-zeros row for that column group instead of an exception.
    """
    numeric = StandardScaler() if scale_numeric else "passthrough"
    return ColumnTransformer(
        transformers=[
            ("num", numeric, make_column_selector(dtype_include=np.number)),
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False, dtype=np.float64),
             make_column_selector(dtype_exclude=np.number)),
        ],
        verbose_feature_names_out=False,
    )


def build_model_pipeline(estimator, scale_numeric: bool = False) -> Pipeline:
    """Raw customer DataFrame in -> predictions out. One artifact, one code path."""
    return Pipeline([
        ("engineer", FunctionTransformer(engineer_features)),
        ("encode", make_encoder(scale_numeric)),
        ("model", estimator),
    ])


def build_catboost_pipeline(estimator) -> Pipeline:
    """CatBoost variant: keeps raw categorical columns (no one-hot)."""
    return Pipeline([
        ("engineer", FunctionTransformer(engineer_features)),
        ("stringify", FunctionTransformer(stringify_categoricals)),
        ("model", estimator),
    ])


def feature_names_of(pipeline: Pipeline) -> list[str]:
    """Human-readable feature names of a fitted build_model_pipeline() pipeline.

    Spaces are normalized to underscores to keep the naming convention the
    dashboard and SHAP tables already use.
    """
    if "encode" in pipeline.named_steps:
        names = pipeline.named_steps["encode"].get_feature_names_out()
        return [str(n).replace(" ", "_") for n in names]
    # CatBoost pipeline: names are the engineered DataFrame columns
    model = pipeline.named_steps["model"]
    if hasattr(model, "feature_names_"):
        return [str(n).replace(" ", "_") for n in model.feature_names_]
    raise ValueError("Cannot determine feature names for this pipeline")


def risk_level(prob: float, threshold: float) -> str:
    """Risk band derived from the actual decision threshold (AUDIT.md §4.F).

    LOW    : below the threshold  -> predicted retain
    MEDIUM : churner in the lower half of [threshold, 1]
    HIGH   : churner in the upper half of [threshold, 1]

    Guarantees risk != "LOW RISK" exactly when prediction == 1.
    """
    if prob < threshold:
        return "LOW RISK"
    if prob >= threshold + 0.5 * (1.0 - threshold):
        return "HIGH RISK"
    return "MEDIUM RISK"

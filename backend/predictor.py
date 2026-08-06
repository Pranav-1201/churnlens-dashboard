"""
predictor.py — single-customer inference over the serialized pipeline artifact.

The artifact IS the full preprocessing+model pipeline (features.build_model_pipeline),
so there is deliberately NO encoding logic in this file: the exact transformers that
were fit at training time run at inference time (fixes AUDIT.md §3.A / brief #8).
"""

import logging

import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline as SkPipeline

from features import risk_level
from model_loader import load_artifact

logger = logging.getLogger(__name__)


def prepare_batch(df_raw: pd.DataFrame) -> pd.DataFrame:
    """Model-ready feature rows for raw customer rows.

    Diagnostic/test helper: exposes exactly what the model sees, produced by the
    fitted pipeline's own preprocessing — the same code path predict() uses.
    """
    pipeline, _, metadata = load_artifact()
    prep = SkPipeline(pipeline.steps[:-1])
    feats = prep.transform(df_raw)
    if isinstance(feats, pd.DataFrame):  # CatBoost pipeline keeps raw categoricals
        return feats
    return pd.DataFrame(
        np.asarray(feats, dtype=float),
        columns=metadata["feature_names"],
        index=df_raw.index,
    )


def prepare_input(raw_input: dict) -> pd.DataFrame:
    """Single raw customer dict -> one model-ready feature row."""
    return prepare_batch(pd.DataFrame([raw_input]))


def get_shap_values(pipeline, metadata: dict, df_raw: pd.DataFrame):
    """Real SHAP values for one customer, or None if unsupported — never fake."""
    try:
        from pipeline import _get_explainer  # explainer dispatch lives with training code

        prep = SkPipeline(pipeline.steps[:-1])
        model = pipeline.named_steps["model"]
        transformed = prep.transform(df_raw)
        names = metadata.get("feature_names", [])

        if isinstance(transformed, pd.DataFrame):  # CatBoost pipeline
            from catboost import CatBoostClassifier, Pool
            if isinstance(model, CatBoostClassifier):
                cat_cols = transformed.select_dtypes(include=["object"]).columns.tolist()
                vals = model.get_feature_importance(
                    Pool(transformed, cat_features=cat_cols), type="ShapValues"
                )[:, :-1]
                cols = [str(c).replace(" ", "_") for c in transformed.columns]
                return {cols[j]: float(vals[0, j]) for j in range(len(cols))}
            return None

        background = metadata.get("shap_background")
        if background is None:
            return None

        explainer = _get_explainer(model, np.asarray(background, dtype=float))
        vals = explainer.shap_values(np.asarray(transformed, dtype=float))
        if isinstance(vals, list):
            vals = vals[1]
        vals = np.asarray(vals)
        if vals.ndim == 3:
            vals = vals[:, :, 1]
        return {names[j]: float(vals[0, j]) for j in range(len(names))}
    except Exception as e:
        logger.warning("SHAP unavailable: %s", e)
        return None


def predict(raw_input: dict) -> dict:
    pipeline, threshold, metadata = load_artifact()

    df = pd.DataFrame([raw_input])
    prob = float(pipeline.predict_proba(df)[:, 1][0])
    pred = int(prob >= threshold)

    return {
        "probability": round(prob, 4),
        "prediction": pred,
        "risk_level": risk_level(prob, threshold),
        "threshold_used": float(threshold),
        "shap_values": get_shap_values(pipeline, metadata, df),
    }

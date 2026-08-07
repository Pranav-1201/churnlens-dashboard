"""Compat shim — the real module is churn_intel.features.

This file MUST stay importable as `features`: models/churn_model.pkl artifacts
trained before the Phase 3 restructure pickle a reference to
`features.engineer_features`, which unpickling resolves through this module.
Remove only after regenerating the artifact with `python backend/train.py`.
"""

from churn_intel.features import (  # noqa: F401
    NUMERIC_INPUT_COLUMNS,
    SERVICE_COLUMNS,
    build_catboost_pipeline,
    build_model_pipeline,
    engineer_features,
    feature_names_of,
    make_encoder,
    risk_level,
    stringify_categoricals,
)

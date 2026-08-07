"""Compat shim — the real module is churn_intel.inference."""

from churn_intel.inference import (  # noqa: F401
    get_shap_values,
    predict,
    prepare_batch,
    prepare_input,
)

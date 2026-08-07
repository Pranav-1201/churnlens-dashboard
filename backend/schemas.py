"""Compat shim — the real module is churn_intel.schemas."""

from churn_intel.schemas import (  # noqa: F401
    REQUIRED_CSV_COLUMNS,
    CustomerInput,
    MetricsResponse,
    ModelMetric,
    PredictionResponse,
    ServiceOption,
    YesNo,
    validate_training_frame,
)

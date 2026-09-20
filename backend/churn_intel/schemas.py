"""schemas.py — request/response schemas and input validation.

Two validation surfaces (Phase 3, item 6):
  * CustomerInput  — the /predict payload. Categorical fields are constrained to
    the exact category sets present in the Telco dataset via typing.Literal, so a
    malformed value is rejected by FastAPI with a 422 before it ever reaches the
    model (instead of silently one-hot-encoding to an all-zeros row).
  * validate_training_frame() — a light, dependency-free schema check for the CSV
    upload path (pandera is intentionally not a dependency). It guards the columns
    and value domains the pipeline relies on and raises ValueError on a bad frame.
"""

from typing import Optional, List, Dict, Literal

import pandas as pd
from pydantic import BaseModel, Field

# ── Shared category vocabularies (verified against data/telco_churn.csv) ───────
YesNo = Literal["Yes", "No"]
# Service columns carry a third "No internet service" category in the raw data.
ServiceOption = Literal["Yes", "No", "No internet service"]


class CustomerInput(BaseModel):
    gender: Literal["Male", "Female"] = "Male"
    SeniorCitizen: Literal[0, 1] = 0
    Partner: YesNo = "No"
    Dependents: YesNo = "No"
    tenure: int = Field(default=1, ge=0, le=72)
    PhoneService: YesNo = "Yes"
    MultipleLines: Literal["Yes", "No", "No phone service"] = "No"
    InternetService: Literal["DSL", "Fiber optic", "No"] = "Fiber optic"
    OnlineSecurity: ServiceOption = "No"
    OnlineBackup: ServiceOption = "No"
    DeviceProtection: ServiceOption = "No"
    TechSupport: ServiceOption = "No"
    StreamingTV: ServiceOption = "No"
    StreamingMovies: ServiceOption = "No"
    Contract: Literal["Month-to-month", "One year", "Two year"] = "Month-to-month"
    PaperlessBilling: YesNo = "Yes"
    PaymentMethod: Literal[
        "Electronic check",
        "Mailed check",
        "Bank transfer (automatic)",
        "Credit card (automatic)",
    ] = "Electronic check"
    MonthlyCharges: float = Field(default=70.0, ge=0)
    TotalCharges: float = Field(default=150.0, ge=0)


# ── CSV-load validation ───────────────────────────────────────────────────────
REQUIRED_CSV_COLUMNS = ("tenure", "MonthlyCharges", "TotalCharges", "Churn")
_ALLOWED_CHURN_VALUES = {"yes", "no", "1", "0", "true", "false"}


def validate_training_frame(df: pd.DataFrame) -> None:
    """Validate an uploaded/demo training CSV. Raise ValueError (collected into a
    single message) if the frame is structurally unusable by the pipeline.

    Deliberately lenient where the pipeline already copes: TotalCharges may be
    blank for tenure==0 rows (clean_data handles that), so a column only fails the
    numeric check when it is entirely non-numeric.
    """
    problems: List[str] = []

    missing = [c for c in REQUIRED_CSV_COLUMNS if c not in df.columns]
    if missing:
        problems.append(f"missing required column(s): {missing}")

    if len(df) == 0:
        problems.append("dataset is empty")

    if "Churn" in df.columns and len(df) > 0:
        seen = set(df["Churn"].astype(str).str.strip().str.lower().unique())
        unexpected = sorted(seen - _ALLOWED_CHURN_VALUES)
        if unexpected:
            problems.append(f"Churn has non-binary values: {unexpected}")

    for col in ("tenure", "MonthlyCharges", "TotalCharges"):
        if col in df.columns and len(df) > 0:
            if pd.to_numeric(df[col], errors="coerce").isna().all():
                problems.append(f"column '{col}' is not numeric")

    if problems:
        raise ValueError("Invalid training CSV: " + "; ".join(problems))


class PredictionResponse(BaseModel):
    probability: float
    prediction: int
    risk_level: str
    threshold_used: float
    shap_values: Optional[Dict[str, float]] = None

class ModelMetric(BaseModel):
    name: str
    accuracy: float
    roc_auc: float
    pr_auc: Optional[float]
    cost: Optional[float]
    status: str
    confusion_matrix: List[List[int]]
    threshold: Optional[float]
    cv_scores: List[float]

class MetricsResponse(BaseModel):
    models: List[ModelMetric]
    best_model: str
    best_threshold: float
    cost_fn: int
    cost_fp: int

"""
Schema-validation tests (Phase 3, items 6 & 7).

Two surfaces are covered:

  * CustomerInput — the /predict payload. Categorical fields are now constrained
    to the exact Telco category sets. Before Phase 3 every categorical was an
    unconstrained `str`, so a bogus value (e.g. Contract="Bogus") was silently
    accepted and one-hot-encoded to an all-zeros column group. The
    `test_bad_categorical_is_rejected` cases would PASS-through (no error) against
    that old permissive schema and now correctly raise — that is the regression
    this file locks in.

  * validate_training_frame — the CSV-upload path used by /run-pipeline.
"""
import os

import pandas as pd
import pytest
from pydantic import ValidationError

from churn_intel.schemas import CustomerInput, validate_training_frame


# ── CustomerInput (API payload) ───────────────────────────────────────────────
def test_valid_default_payload_constructs():
    c = CustomerInput()  # every default is a real Telco category
    assert c.Contract == "Month-to-month"


def test_valid_explicit_payload_constructs():
    c = CustomerInput(
        gender="Female", SeniorCitizen=1, Contract="Two year",
        InternetService="DSL", PaymentMethod="Credit card (automatic)",
        MultipleLines="No phone service", OnlineSecurity="No internet service",
        tenure=24, MonthlyCharges=55.5, TotalCharges=1300.0,
    )
    assert c.OnlineSecurity == "No internet service"


@pytest.mark.parametrize("field,bad", [
    ("Contract", "Bogus"),
    ("gender", "Other"),
    ("InternetService", "Satellite"),
    ("PaymentMethod", "Crypto"),
    ("MultipleLines", "Maybe"),
])
def test_bad_categorical_is_rejected(field, bad):
    with pytest.raises(ValidationError):
        CustomerInput(**{field: bad})


@pytest.mark.parametrize("tenure", [-1, 73, 1000])
def test_tenure_out_of_range_is_rejected(tenure):
    with pytest.raises(ValidationError):
        CustomerInput(tenure=tenure)


def test_negative_charges_rejected():
    with pytest.raises(ValidationError):
        CustomerInput(MonthlyCharges=-5)


def test_predict_endpoint_rejects_bad_categorical():
    """End-to-end: FastAPI enforces the schema and returns 422 before the model
    runs (so no artifact load is needed for this path)."""
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)
    resp = client.post("/predict", json={"Contract": "Bogus"})
    assert resp.status_code == 422


# ── validate_training_frame (CSV path) ────────────────────────────────────────
def _valid_frame() -> pd.DataFrame:
    return pd.DataFrame({
        "tenure": [1, 24, 0],
        "MonthlyCharges": [70.0, 55.5, 20.0],
        "TotalCharges": [70.0, 1300.0, ""],  # blank is legit for tenure==0
        "Churn": ["Yes", "No", "No"],
    })


def test_valid_frame_passes():
    validate_training_frame(_valid_frame())  # must not raise


def test_missing_required_column_raises():
    df = _valid_frame().drop(columns=["Churn"])
    with pytest.raises(ValueError, match="missing required column"):
        validate_training_frame(df)


def test_empty_frame_raises():
    with pytest.raises(ValueError, match="empty"):
        validate_training_frame(_valid_frame().iloc[0:0])


def test_non_binary_churn_raises():
    df = _valid_frame()
    df.loc[0, "Churn"] = "Maybe"
    with pytest.raises(ValueError, match="non-binary"):
        validate_training_frame(df)


def test_real_demo_csv_passes():
    csv = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data", "telco_churn.csv",
    )
    if not os.path.exists(csv):
        pytest.skip("demo dataset not present")
    validate_training_frame(pd.read_csv(csv))

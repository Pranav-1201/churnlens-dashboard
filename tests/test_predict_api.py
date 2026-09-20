"""
API-level regression tests for the /predict path (AUDIT.md §3.A and §4.F).

These run against the real serialized artifact (models/churn_model.pkl):
a single raw customer must keep its categorical signal end-to-end, and the
risk label must agree with the decision the threshold actually makes.
"""
import pytest

from churn_intel import inference
from churn_intel.features import risk_level
from test_encoding_regression import CUSTOMER


def test_single_customer_categoricals_reach_the_model():
    """The exact test that would have caught the original bug at the API level."""
    row = inference.prepare_input(CUSTOMER)
    values = row.iloc[0]

    if "Contract" in row.columns:
        # Raw-categorical artifact (CatBoost pipeline): values pass through as-is.
        for col in ("gender", "Partner", "Contract", "InternetService",
                    "OnlineSecurity", "PaymentMethod", "StreamingTV"):
            assert str(values[col]) == str(CUSTOMER[col]), (
                f"{col} lost at the model input: {values[col]!r} != {CUSTOMER[col]!r}")
        return

    expected = {
        "gender_Female": 1,
        "Partner_Yes": 1,
        "Contract_One_year": 1,
        "Contract_Month-to-month": 0,
        "Contract_Two_year": 0,
        "InternetService_Fiber_optic": 1,
        "OnlineSecurity_Yes": 1,
        "PaymentMethod_Credit_card_(automatic)": 1,
        "StreamingTV_Yes": 1,
    }

    missing = [c for c in expected if c not in row.columns]
    assert not missing, f"expected encoded columns missing from model input: {missing}"

    wrong = {c: float(values[c]) for c, v in expected.items() if float(values[c]) != v}
    assert not wrong, f"categorical signal wrong at the model input: {wrong}"


def test_predict_response_is_internally_consistent():
    res = inference.predict(CUSTOMER)

    assert 0.0 <= res["probability"] <= 1.0
    assert res["prediction"] == int(res["probability"] >= res["threshold_used"])

    # §4.F: the risk label must be derived from the actual decision threshold —
    # "LOW RISK" if and only if the model predicts retain.
    assert (res["risk_level"] != "LOW RISK") == bool(res["prediction"])
    assert res["risk_level"] == risk_level(res["probability"], res["threshold_used"])

    # SHAP is either real values or None — never a fabricated fallback.
    if res["shap_values"] is not None:
        assert isinstance(res["shap_values"], dict) and len(res["shap_values"]) > 0

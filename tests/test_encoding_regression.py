"""
Regression test for AUDIT.md §3.A:

`predictor.prepare_input()` one-hot encodes a SINGLE customer row with
`pd.get_dummies(drop_first=True)`. With one row, every object column has exactly
one category present, so drop_first drops it — producing zero dummy columns.
The reindex(fill_value=0) then silently sets every OHE feature to 0.

The same row encoded inside a batch (where drop_first has real alternatives to
drop against) keeps its categorical information. The two encodings MUST match:
a customer's features cannot depend on who else happens to be in the batch.
"""
import pandas as pd
import pytest

from churn_intel import inference as predictor


CUSTOMER = {
    "gender": "Female",
    "SeniorCitizen": 0,
    "Partner": "Yes",
    "Dependents": "No",
    "tenure": 24,
    "PhoneService": "Yes",
    "MultipleLines": "Yes",
    "InternetService": "Fiber optic",
    "OnlineSecurity": "Yes",
    "OnlineBackup": "No",
    "DeviceProtection": "Yes",
    "TechSupport": "No",
    "StreamingTV": "Yes",
    "StreamingMovies": "No",
    "Contract": "One year",
    "PaperlessBilling": "Yes",
    "PaymentMethod": "Credit card (automatic)",
    "MonthlyCharges": 95.0,
    "TotalCharges": 2280.0,
}

# Companion rows covering the other category levels, so batch-mode
# drop_first has a real baseline level to drop for every column.
VARIANTS = [
    {**CUSTOMER, "gender": "Male", "Partner": "No", "Dependents": "Yes",
     "MultipleLines": "No", "InternetService": "DSL", "OnlineSecurity": "No",
     "OnlineBackup": "Yes", "DeviceProtection": "No", "TechSupport": "Yes",
     "StreamingTV": "No", "StreamingMovies": "Yes", "Contract": "Month-to-month",
     "PaperlessBilling": "No", "PaymentMethod": "Electronic check", "tenure": 3},
    {**CUSTOMER, "InternetService": "No", "MultipleLines": "No phone service",
     "PhoneService": "No", "Contract": "Two year",
     "PaymentMethod": "Mailed check", "tenure": 70,
     "OnlineSecurity": "No internet service", "OnlineBackup": "No internet service",
     "DeviceProtection": "No internet service", "TechSupport": "No internet service",
     "StreamingTV": "No internet service", "StreamingMovies": "No internet service"},
    {**CUSTOMER, "Contract": "Month-to-month",
     "PaymentMethod": "Bank transfer (automatic)", "tenure": 14},
]


def _encode_batch_row0() -> pd.DataFrame:
    """Encode CUSTOMER as row 0 of a batch, via the same inference encoding logic.

    If the fixed code path exposes a batch encoder (`prepare_batch`), use it —
    single-row and batch encodings must then agree by construction. Against the
    current (buggy) code, replicate prepare_input's own logic on a batch, which
    is exactly how the training data was encoded.
    """
    batch = pd.DataFrame([CUSTOMER] + VARIANTS)

    if hasattr(predictor, "prepare_batch"):
        encoded = predictor.prepare_batch(batch)
    else:
        df = predictor.feature_engineering(batch)
        encoded = pd.get_dummies(df, drop_first=True)
        encoded.columns = encoded.columns.str.replace(" ", "_")
        encoded = encoded.reindex(columns=predictor.FEATURE_COLUMNS, fill_value=0)

    return encoded.iloc[[0]].reset_index(drop=True)


def test_single_row_encoding_matches_batch_encoding():
    single = predictor.prepare_input(CUSTOMER).reset_index(drop=True)
    batch_row0 = _encode_batch_row0()

    assert list(single.columns) == list(batch_row0.columns)

    mismatched = [
        col for col in single.columns
        if single.at[0, col] != batch_row0.at[0, col]
    ]
    assert not mismatched, (
        "Single-row encoding disagrees with batch encoding of the SAME customer "
        f"on {len(mismatched)} columns: {mismatched}\n"
        f"single values: {[single.at[0, c] for c in mismatched]}\n"
        f"batch  values: {[batch_row0.at[0, c] for c in mismatched]}"
    )


def test_single_row_encoding_preserves_categorical_signal():
    """The known categorical values of this customer must survive encoding.

    OHE-style model input -> the matching dummy columns must be 1.
    Raw-categorical model input (CatBoost pipeline) -> the values pass through.
    """
    single = predictor.prepare_input(CUSTOMER)
    row = single.iloc[0]

    if "Contract" in single.columns:  # raw-categorical (CatBoost) artifact
        for col in ("Partner", "Contract", "InternetService", "PaymentMethod",
                    "OnlineSecurity", "StreamingTV"):
            assert str(row[col]) == str(CUSTOMER[col]), (
                f"categorical signal destroyed for {col}: "
                f"{row[col]!r} != {CUSTOMER[col]!r}")
        return

    expected_hot = [c for c in [
        "Partner_Yes", "MultipleLines_Yes", "InternetService_Fiber_optic",
        "OnlineSecurity_Yes", "DeviceProtection_Yes", "StreamingTV_Yes",
        "Contract_One_year", "PaperlessBilling_Yes",
        "PaymentMethod_Credit_card_(automatic)",
    ] if c in single.columns]
    assert expected_hot, "expected OHE columns not found — column naming changed?"

    zeroed = [c for c in expected_hot if float(row[c]) != 1.0]
    assert not zeroed, f"categorical signal destroyed for: {zeroed}"

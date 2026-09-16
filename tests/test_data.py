"""Tests for churn_intel.data — dataset cleaning and the /eda summary."""

import numpy as np
import pandas as pd
import pytest

from churn_intel.data import clean_data, compute_eda_summary


# ── clean_data ───────────────────────────────────────────────────────────────


def test_clean_data_names_exactly_the_missing_required_columns():
    with pytest.raises(ValueError) as excinfo:
        clean_data(pd.DataFrame({"tenure": [1, 2]}))
    # The message goes on to list ALL required columns, so only the leading
    # "missing" clause says which ones are actually absent.
    missing_clause = str(excinfo.value).split("The pipeline requires")[0]
    for column in ("MonthlyCharges", "TotalCharges", "Churn"):
        assert column in missing_clause
    assert "tenure" not in missing_clause


def test_clean_data_zeroes_new_customers_before_the_median_fill():
    """Order matters: tenure==0 rows are set to 0 FIRST, so that zero is part of
    the median that fills the remaining blanks."""
    df = pd.DataFrame({
        "tenure": [0, 10, 20, 30],
        "MonthlyCharges": [20.0, 30.0, 40.0, 50.0],
        "TotalCharges": ["", "100.5", " ", "300"],
        "Churn": ["No", "Yes", "No", "Yes"],
    })

    cleaned = clean_data(df)

    # After coercion: [NaN, 100.5, NaN, 300]; tenure==0 zeroes row 0; the median
    # of the non-null values [0, 100.5, 300] then fills row 2.
    expected_median = float(np.median([0.0, 100.5, 300.0]))
    assert cleaned["TotalCharges"].tolist() == [0.0, 100.5, expected_median, 300.0]


def test_clean_data_maps_churn_to_binary_and_drops_unmapped_rows():
    df = pd.DataFrame({
        "tenure": [5, 6, 7],
        "MonthlyCharges": [20.0, 30.0, 40.0],
        "TotalCharges": ["100", "180", "280"],
        "Churn": ["Yes", "Maybe", "No"],
    })

    cleaned = clean_data(df)

    assert cleaned["Churn"].tolist() == [1, 0]
    assert cleaned["tenure"].tolist() == [5, 7]


def test_clean_data_drops_customer_id_when_present():
    df = pd.DataFrame({
        "customerID": ["a", "b"],
        "tenure": [1, 2],
        "MonthlyCharges": [10.0, 20.0],
        "TotalCharges": ["10", "40"],
        "Churn": ["No", "Yes"],
    })
    assert "customerID" not in clean_data(df).columns


def test_clean_data_tolerates_a_frame_without_customer_id():
    df = pd.DataFrame({
        "tenure": [1, 2],
        "MonthlyCharges": [10.0, 20.0],
        "TotalCharges": ["10", "40"],
        "Churn": ["No", "Yes"],
    })
    assert len(clean_data(df)) == 2


def test_clean_data_does_not_mutate_the_callers_frame():
    df = pd.DataFrame({
        "tenure": [0, 3],
        "MonthlyCharges": [10.0, 20.0],
        "TotalCharges": ["", "60"],
        "Churn": ["No", "Yes"],
    })
    before = df.copy()
    clean_data(df)
    pd.testing.assert_frame_equal(df, before)


# ── compute_eda_summary ──────────────────────────────────────────────────────


@pytest.fixture
def eda_frame():
    return pd.DataFrame({
        "tenure": [1, 12, 24, 36],
        "MonthlyCharges": [20.0, 50.0, 80.0, 110.0],
        "TotalCharges": ["20", "600", "1920", "3960"],
        # Mixed case and stray whitespace: the summary normalizes these itself.
        "Churn": [" Yes", "no", "NO", "yes"],
        "Contract": ["Month-to-month", "One year", "One year", "Month-to-month"],
    })


def test_eda_summary_counts_and_churn_rate(eda_frame):
    summary = compute_eda_summary(eda_frame)

    assert summary["total_customers"] == 4
    assert summary["churn_count"] == 2
    assert summary["retain_count"] == 2
    assert summary["churn_rate"] == 0.5


def test_eda_summary_churn_rate_by_contract(eda_frame):
    by_contract = {
        row["Contract"]: row["churn_rate"]
        for row in compute_eda_summary(eda_frame)["by_contract"]
    }
    assert by_contract == {"Month-to-month": 1.0, "One year": 0.0}


def test_eda_summary_omits_contract_breakdown_without_the_column(eda_frame):
    summary = compute_eda_summary(eda_frame.drop(columns=["Contract"]))
    assert summary["by_contract"] == []


def test_eda_summary_bins_tenure_into_10_and_charges_into_8(eda_frame):
    summary = compute_eda_summary(eda_frame)

    tenure_bins = summary["tenure_distribution"]
    charge_bins = summary["monthly_charges_distribution"]
    assert len(tenure_bins) == 10
    assert len(charge_bins) == 8
    # Every customer lands in exactly one bin.
    assert sum(b["customers"] for b in tenure_bins) == 4
    assert sum(b["customers"] for b in charge_bins) == 4


def test_eda_summary_feature_means(eda_frame):
    stats = compute_eda_summary(eda_frame)["feature_stats"]

    assert stats["mean_tenure"] == round(sum([1, 12, 24, 36]) / 4, 2)
    assert stats["mean_monthly_charges"] == round(sum([20.0, 50.0, 80.0, 110.0]) / 4, 2)
    # TotalCharges arrives as strings and must be coerced before averaging.
    assert stats["mean_total_charges"] == round(sum([20, 600, 1920, 3960]) / 4, 2)


def test_eda_summary_returns_the_zero_shape_when_no_row_has_valid_churn():
    df = pd.DataFrame({
        "tenure": [1, 2],
        "MonthlyCharges": [10.0, 20.0],
        "TotalCharges": ["10", "40"],
        "Churn": ["maybe", "unknown"],
    })

    assert compute_eda_summary(df) == {
        "total_customers": 0,
        "churn_rate": 0.0,
        "churn_count": 0,
        "retain_count": 0,
        "by_contract": [],
        "tenure_distribution": [],
        "monthly_charges_distribution": [],
        "feature_stats": {},
    }

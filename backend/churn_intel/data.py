"""data.py — dataset cleaning and the EDA summary served by /eda."""

import pandas as pd


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    REQUIRED_COLUMNS = ["tenure", "MonthlyCharges", "TotalCharges", "Churn"]
    missing_required = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_required:
        raise ValueError(
            f"Dataset is missing required column(s): {', '.join(missing_required)}. "
            f"The pipeline requires these columns: {', '.join(REQUIRED_COLUMNS)}. "
            f"Please check your CSV file and ensure these columns exist."
        )

    df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce")
    df.loc[df["tenure"] == 0, "TotalCharges"] = 0
    df["TotalCharges"] = df["TotalCharges"].fillna(df["TotalCharges"].median())

    df["Churn"] = df["Churn"].map({"Yes": 1, "No": 0})
    df = df[df["Churn"].notna()]

    if "customerID" in df.columns:
        df.drop(columns=["customerID"], inplace=True)

    return df


def compute_eda_summary(df_raw: pd.DataFrame) -> dict:
    df = df_raw.copy()

    if "Churn" in df.columns:
        df["Churn"] = df["Churn"].astype(str).str.strip().str.lower()
        df["Churn"] = df["Churn"].map({"yes": 1, "no": 0})
        df["Churn"] = pd.to_numeric(df["Churn"], errors="coerce")
        df = df.dropna(subset=["Churn"])

    if "TotalCharges" in df.columns:
        df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce")

    if len(df) == 0:
        return {
            "total_customers": 0,
            "churn_rate": 0.0,
            "churn_count": 0,
            "retain_count": 0,
            "by_contract": [],
            "tenure_distribution": [],
            "monthly_charges_distribution": [],
            "feature_stats": {},
        }

    total_customers = int(len(df))
    churn_rate = float(df["Churn"].mean())
    churn_count = int(df["Churn"].sum())
    retain_count = int(total_customers - churn_count)

    by_contract = []
    if "Contract" in df.columns:
        by_contract = (
            df.groupby("Contract")["Churn"].mean()
            .reset_index()
            .rename(columns={"Churn": "churn_rate"})
            .to_dict(orient="records")
        )

    tenure_dist = []
    if "tenure" in df.columns and len(df["tenure"].dropna()) > 0:
        tenure_bins = pd.cut(df["tenure"], bins=10)
        tenure_df = (
            df.groupby(tenure_bins, observed=False)["Churn"]
            .agg(["count", "mean"])
            .reset_index()
            .rename(columns={"count": "customers", "mean": "churn_rate"})
        )
        tenure_df["bin"] = tenure_df.iloc[:, 0].apply(lambda x: str(x))
        tenure_df = tenure_df.drop(columns=[tenure_df.columns[0]])
        tenure_dist = tenure_df.to_dict(orient="records")

    mc_dist = []
    if "MonthlyCharges" in df.columns and len(df["MonthlyCharges"].dropna()) > 0:
        mc_bins = pd.cut(df["MonthlyCharges"], bins=8)
        mc_df = (
            df.groupby(mc_bins, observed=False)["Churn"]
            .agg(["count", "mean"])
            .reset_index()
            .rename(columns={"count": "customers", "mean": "churn_rate"})
        )
        mc_df["bin"] = mc_df.iloc[:, 0].apply(lambda x: str(x))
        mc_df = mc_df.drop(columns=[mc_df.columns[0]])
        mc_dist = mc_df.to_dict(orient="records")

    feature_stats = {}
    if "tenure" in df.columns:
        feature_stats["mean_tenure"] = round(float(df["tenure"].mean()), 2)
    if "MonthlyCharges" in df.columns:
        feature_stats["mean_monthly_charges"] = round(float(df["MonthlyCharges"].mean()), 2)
    if "TotalCharges" in df.columns:
        feature_stats["mean_total_charges"] = round(float(df["TotalCharges"].mean()), 2)

    return {
        "total_customers": total_customers,
        "churn_rate": round(churn_rate, 4),
        "churn_count": churn_count,
        "retain_count": retain_count,
        "by_contract": by_contract,
        "tenure_distribution": tenure_dist,
        "monthly_charges_distribution": mc_dist,
        "feature_stats": feature_stats,
    }

"""
train.py — one-command reproduction of the full training pipeline.

    python train.py [--data ../data/telco_churn.csv] [--out ../models/churn_model.pkl]

Runs the exact same run_pipeline() the API uses, then serializes the winning
pipeline (preprocessing + model + threshold + metadata) as a single artifact.
"""

import argparse
import json
import os

import pandas as pd

from pipeline import run_pipeline

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA = os.path.join(BASE_DIR, "..", "data", "telco_churn.csv")
DEFAULT_OUT = os.path.join(BASE_DIR, "..", "models", "churn_model.pkl")


def main():
    parser = argparse.ArgumentParser(description="Train ChurnLens and save the model artifact")
    parser.add_argument("--data", default=DEFAULT_DATA, help="Path to the raw Telco CSV")
    parser.add_argument("--out", default=DEFAULT_OUT, help="Where to write the artifact")
    args = parser.parse_args()

    df = pd.read_csv(args.data)
    print(f"[train] Loaded {len(df)} rows from {args.data}")

    results = run_pipeline(
        df,
        progress_callback=lambda pct, msg: print(f"[train] [{pct:3d}%] {msg}"),
        artifact_path=args.out,
    )

    print("\n[train] Model comparison (validation, out-of-fold):")
    header = f"{'model':<24} {'cv_auc':>8} {'val_cost':>10} {'threshold':>10} {'status':>10}"
    print(header)
    print("-" * len(header))
    for m in sorted(results["models"], key=lambda r: r["cost"]):
        print(f"{m['name']:<24} {m['cv_mean']:>8.4f} {m['cost']:>10,} "
              f"{m['threshold']:>10.4f} {m['status']:>10}")

    print("\n[train] Final evaluation (single look at the held-out test set):")
    print(json.dumps(results["final_evaluation"], indent=2))


if __name__ == "__main__":
    main()

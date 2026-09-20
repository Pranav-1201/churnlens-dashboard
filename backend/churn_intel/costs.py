"""costs.py — business-cost model: CLV-derived costs and threshold curves."""

import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix

from .config import (
    COST_FN,
    COST_FP,
    DEFAULT_COST_RATIOS,
    GROSS_MARGIN,
    OFFER_DURATION_MONTHS,
    RETENTION_DISCOUNT,
    THRESHOLD_GRID,
)


def derive_costs(df: pd.DataFrame) -> tuple[int, int, dict]:
    """Derive FN/FP costs from the dataset instead of guessing them.

    FN (missed churner)  = expected remaining customer lifetime value lost
        = mean(MonthlyCharges) * mean_tenure_of_retained_customers * GROSS_MARGIN
      i.e. the margin on the revenue a churner would have produced over a typical
      retained customer's lifetime.

    FP (wasted retention offer) = the incentive spent on a customer who was not
      going to churn
        = RETENTION_DISCOUNT * mean(MonthlyCharges) * OFFER_DURATION_MONTHS

    Returns (cost_fn, cost_fp, derivation) where `derivation` documents every
    input so the dashboard can show the formula. Falls back to COST_FN/COST_FP
    if the required columns are missing.
    """
    if "MonthlyCharges" not in df.columns or "tenure" not in df.columns:
        return COST_FN, COST_FP, {"method": "fallback_constants",
                                  "reason": "MonthlyCharges/tenure missing"}

    mc = pd.to_numeric(df["MonthlyCharges"], errors="coerce")
    avg_monthly = float(mc.mean())

    # Lifetime proxy: how long a *retained* customer stays.
    if "Churn" in df.columns:
        churn = df["Churn"].astype(str).str.strip().str.lower()
        retained_tenure = pd.to_numeric(df.loc[churn == "no", "tenure"], errors="coerce")
        lifetime = float(retained_tenure.mean()) if retained_tenure.notna().any() \
            else float(pd.to_numeric(df["tenure"], errors="coerce").mean())
    else:
        lifetime = float(pd.to_numeric(df["tenure"], errors="coerce").mean())

    cost_fn = int(round(avg_monthly * lifetime * GROSS_MARGIN))
    cost_fp = int(round(RETENTION_DISCOUNT * avg_monthly * OFFER_DURATION_MONTHS))
    cost_fp = max(cost_fp, 1)  # guard against zero

    derivation = {
        "method": "clv_derived",
        "avg_monthly_charges": round(avg_monthly, 2),
        "retained_lifetime_months": round(lifetime, 2),
        "gross_margin": GROSS_MARGIN,
        "retention_discount": RETENTION_DISCOUNT,
        "offer_duration_months": OFFER_DURATION_MONTHS,
        "cost_fn": cost_fn,
        "cost_fp": cost_fp,
        "cost_fn_formula": "avg_monthly_charges * retained_lifetime_months * gross_margin",
        "cost_fp_formula": "retention_discount * avg_monthly_charges * offer_duration_months",
    }
    return cost_fn, cost_fp, derivation


def business_cost(y_true, y_pred, cost_fn=COST_FN, cost_fp=COST_FP) -> int:
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()
    return int(fn * cost_fn + fp * cost_fp)


def find_best_threshold(y_true, y_prob, cost_fn=COST_FN, cost_fp=COST_FP):
    best_thresh, best_cost = 0.5, float("inf")
    for t in np.linspace(0.01, 0.99, 50):
        preds = (y_prob >= t).astype(int)
        cost = business_cost(y_true, preds, cost_fn, cost_fp)
        if cost < best_cost:
            best_cost = cost
            best_thresh = float(t)
    return best_thresh, best_cost


def cost_threshold_curve(y_true, y_prob, cost_fn=COST_FN, cost_fp=COST_FP, grid=None):
    """Real precision/recall/F1/cost at each threshold, computed directly from
    (y_true, y_prob) — no interpolation, no simulation.

    Used for both the shipped curve (on out-of-fold validation predictions) and
    the /threshold-curve endpoint (recomputed with caller-supplied costs). Every
    point is an exact confusion-matrix evaluation, so the plotted cost equals
    fn*cost_fn + fp*cost_fp by construction (see tests/test_threshold_curve.py).
    """
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob, dtype=float)
    if grid is None:
        grid = THRESHOLD_GRID

    rows = []
    for t in grid:
        t = float(t)
        pred = (y_prob >= t).astype(int)
        tp = int(np.sum((pred == 1) & (y_true == 1)))
        fp = int(np.sum((pred == 1) & (y_true == 0)))
        fn = int(np.sum((pred == 0) & (y_true == 1)))
        tn = int(np.sum((pred == 0) & (y_true == 0)))
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
        rows.append({
            "threshold": round(t, 2),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "cost": int(fn * cost_fn + fp * cost_fp),
        })
    return rows


def cost_sensitivity_curve(y_true, y_prob, cost_fp=COST_FP, ratios=None):
    """How the cost-optimal threshold and its cost shift as the FN/FP cost ratio
    varies. FP cost is held fixed; FN = ratio * FP. Each point reuses the exact
    cost_threshold_curve(), so nothing here is interpolated.

    Demonstrates that cost-sensitive learning is not a fixed point: the operating
    threshold you should deploy depends entirely on how much a miss costs
    relative to a false alarm.
    """
    if ratios is None:
        ratios = DEFAULT_COST_RATIOS
    out = []
    for r in ratios:
        cost_fn = float(r) * float(cost_fp)
        curve = cost_threshold_curve(y_true, y_prob, cost_fn, cost_fp)
        opt = min(curve, key=lambda p: p["cost"])
        out.append({
            "ratio": float(r),
            "cost_fn": cost_fn,
            "cost_fp": float(cost_fp),
            "optimal_threshold": opt["threshold"],
            "optimal_cost": opt["cost"],
            "recall_at_optimal": opt["recall"],
            "precision_at_optimal": opt["precision"],
        })
    return out

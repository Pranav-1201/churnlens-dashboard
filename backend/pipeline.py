"""Compat shim — the training code now lives in the churn_intel package:
config (constants), data (cleaning/EDA), costs (cost model + curves),
modeling (OOF/zoo/SHAP), pipeline (run_pipeline orchestration).

Kept so pre-restructure imports (tests, external scripts) keep working;
new code should import from churn_intel directly.
"""

from churn_intel.artifacts import save_artifact  # noqa: F401
from churn_intel.config import (  # noqa: F401
    COST_FN,
    COST_FP,
    DEFAULT_COST_RATIOS,
    GROSS_MARGIN,
    OFFER_DURATION_MONTHS,
    RANDOM_STATE,
    RETENTION_DISCOUNT,
    THRESHOLD_GRID,
)
from churn_intel.costs import (  # noqa: F401
    business_cost,
    cost_sensitivity_curve,
    cost_threshold_curve,
    derive_costs,
    find_best_threshold,
)
from churn_intel.data import clean_data, compute_eda_summary  # noqa: F401
from churn_intel.modeling import (  # noqa: F401
    HAS_CAT,
    HAS_LGB,
    HAS_XGB,
    _get_explainer,
    oof_probabilities,
)
from churn_intel.pipeline import run_pipeline  # noqa: F401

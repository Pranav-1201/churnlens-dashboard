"""config.py — central tunable constants.

Phase 3 item 4 will externalize these to a config.yaml; until then this module
is the single place they live (formerly scattered through pipeline.py).
"""

import numpy as np

# Fallback costs, used only if derivation from data is impossible. These are the
# original hardcoded guesses, kept solely as a last resort — real runs derive
# costs from the dataset via costs.derive_costs().
COST_FN = 10_000
COST_FP = 500

RANDOM_STATE = 42

# ── Cost-derivation assumptions, documented so a reviewer can challenge them ──
GROSS_MARGIN = 0.30            # telecom gross margin — a missed churner loses
                               #   margin, not gross revenue
RETENTION_DISCOUNT = 0.20      # a retention offer is ~20% off ...
OFFER_DURATION_MONTHS = 3      #   ... for ~3 months

# Shared grid for the published cost-vs-threshold curve (0.01..0.99, step 0.01).
THRESHOLD_GRID = np.round(np.arange(0.01, 1.00, 0.01), 2)

DEFAULT_COST_RATIOS = [1, 2, 3, 5, 8, 10, 15, 20, 30, 50, 75, 100]

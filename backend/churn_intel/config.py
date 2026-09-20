"""config.py — tunable constants, loaded from ``backend/config.yaml``.

The values below used to be literals in this module. They now come from a YAML
file so a reviewer can see and change every assumption in one place without
reading Python.

Two properties worth knowing before you edit this:

* **Load is at import, once.** Consumers do ``from .config import COST_FN`` and
  several use the constants as default argument values (``costs.business_cost``,
  ``costs.find_best_threshold``, ``modeling._run_model``). Python binds both of
  those at import time, so there is no meaningful "reload the config at runtime"
  — changing the YAML requires restarting the process.
* **Errors are loud.** Missing file, unparseable YAML, absent key, or wrong type
  all raise :class:`ConfigError`. Nothing falls back to a built-in default; a
  silently-ignored typo would mean training against a value you believe you
  changed.

Override the file location with the ``CHURN_CONFIG`` environment variable.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np
import yaml

#: Shipped config, resolved from this file's location rather than the caller's
#: working directory — pytest runs from the repo root, uvicorn runs from backend/.
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"

ENV_VAR = "CHURN_CONFIG"


class ConfigError(RuntimeError):
    """Raised when the configuration file is missing, malformed, or invalid."""


def _resolve_path(path: str | os.PathLike[str] | None) -> Path:
    """Explicit argument wins, then $CHURN_CONFIG, then the shipped default."""
    if path is not None:
        return Path(path)
    from_env = os.environ.get(ENV_VAR)
    if from_env:
        return Path(from_env)
    return DEFAULT_CONFIG_PATH


def _section(raw: dict, name: str, source: Path) -> dict:
    value = raw.get(name)
    if not isinstance(value, dict):
        raise ConfigError(
            f"{source}: missing or non-mapping section '{name}'"
        )
    return value


def _number(
    section: dict, key: str, section_name: str, source: Path, *, integer: bool = False
) -> Any:
    if key not in section:
        raise ConfigError(f"{source}: missing key '{section_name}.{key}'")
    value = section[key]
    # bool is a subclass of int; `cost_fn: true` is a mistake, not a number.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ConfigError(
            f"{source}: '{section_name}.{key}' must be a number, "
            f"got {type(value).__name__} ({value!r})"
        )
    if integer and not isinstance(value, int):
        raise ConfigError(
            f"{source}: '{section_name}.{key}' must be an integer, got {value!r}"
        )
    return value


def _string(section: dict, key: str, section_name: str, source: Path) -> str:
    if key not in section:
        raise ConfigError(f"{source}: missing key '{section_name}.{key}'")
    value = section[key]
    if not isinstance(value, str):
        raise ConfigError(
            f"{source}: '{section_name}.{key}' must be a string, got {value!r}"
        )
    return value


def _number_list(section: dict, key: str, section_name: str, source: Path) -> list:
    if key not in section:
        raise ConfigError(f"{source}: missing key '{section_name}.{key}'")
    value = section[key]
    if not isinstance(value, list) or not value:
        raise ConfigError(
            f"{source}: '{section_name}.{key}' must be a non-empty list, got {value!r}"
        )
    for item in value:
        if isinstance(item, bool) or not isinstance(item, (int, float)):
            raise ConfigError(
                f"{source}: '{section_name}.{key}' must contain only numbers, "
                f"found {item!r}"
            )
    return value


def load_config(path: str | os.PathLike[str] | None = None) -> dict:
    """Read, validate, and normalize the configuration file.

    Returns a nested dict mirroring the YAML, with two normalizations applied:
    ``thresholds.grid`` becomes the materialized numpy array, and
    ``paths.demo_csv`` becomes an absolute path resolved against the config
    file's own directory.

    Raises:
        ConfigError: the file is missing or unreadable, the YAML does not parse,
            a required section or key is absent, or a value has the wrong type.
    """
    source = _resolve_path(path)

    try:
        text = source.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ConfigError(f"config file not found: {source}") from exc
    except OSError as exc:
        raise ConfigError(f"could not read config file {source}: {exc}") from exc

    try:
        raw = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ConfigError(f"{source}: could not parse YAML: {exc}") from exc

    if not isinstance(raw, dict):
        raise ConfigError(f"{source}: top level must be a mapping, got {type(raw).__name__}")

    costs = _section(raw, "costs", source)
    thresholds = _section(raw, "thresholds", source)
    training = _section(raw, "training", source)
    paths = _section(raw, "paths", source)
    grid = _section(thresholds, "grid", source)

    start = _number(grid, "start", "thresholds.grid", source)
    stop = _number(grid, "stop", "thresholds.grid", source)
    step = _number(grid, "step", "thresholds.grid", source)
    if step <= 0:
        raise ConfigError(f"{source}: 'thresholds.grid.step' must be positive, got {step!r}")
    if stop <= start:
        raise ConfigError(
            f"{source}: 'thresholds.grid.stop' ({stop!r}) must exceed 'start' ({start!r})"
        )

    demo_csv = _string(paths, "demo_csv", "paths", source)

    return {
        "costs": {
            "cost_fn": _number(costs, "cost_fn", "costs", source, integer=True),
            "cost_fp": _number(costs, "cost_fp", "costs", source, integer=True),
            "gross_margin": _number(costs, "gross_margin", "costs", source),
            "retention_discount": _number(costs, "retention_discount", "costs", source),
            "offer_duration_months": _number(
                costs, "offer_duration_months", "costs", source, integer=True
            ),
        },
        "thresholds": {
            # Rounded to 2 decimals, preserving the original expression
            # `np.round(np.arange(0.01, 1.00, 0.01), 2)` exactly. See the note in
            # config.yaml before changing the step to a finer resolution.
            "grid": np.round(np.arange(start, stop, step), 2),
            "default_cost_ratios": _number_list(
                thresholds, "default_cost_ratios", "thresholds", source
            ),
        },
        "training": {
            "random_state": _number(training, "random_state", "training", source, integer=True),
            "test_size": _number(training, "test_size", "training", source),
            "val_size": _number(training, "val_size", "training", source),
            "n_splits": _number(training, "n_splits", "training", source, integer=True),
        },
        "paths": {
            # Relative to the config file, never the caller's cwd.
            "demo_csv": str((source.resolve().parent / demo_csv).resolve()),
        },
    }


CONFIG = load_config()

# ── Costs ────────────────────────────────────────────────────────────────────
# Fallback costs, used only if derivation from the data is impossible; real runs
# derive costs from the dataset via costs.derive_costs().
COST_FN: int = CONFIG["costs"]["cost_fn"]
COST_FP: int = CONFIG["costs"]["cost_fp"]

# Cost-derivation assumptions, documented so a reviewer can challenge them.
GROSS_MARGIN: float = CONFIG["costs"]["gross_margin"]
RETENTION_DISCOUNT: float = CONFIG["costs"]["retention_discount"]
OFFER_DURATION_MONTHS: int = CONFIG["costs"]["offer_duration_months"]

# ── Thresholds ───────────────────────────────────────────────────────────────
#: Shared grid for the published cost-vs-threshold curve (0.01..0.99, step 0.01).
THRESHOLD_GRID: np.ndarray = CONFIG["thresholds"]["grid"]
DEFAULT_COST_RATIOS: list = CONFIG["thresholds"]["default_cost_ratios"]

# ── Training ─────────────────────────────────────────────────────────────────
RANDOM_STATE: int = CONFIG["training"]["random_state"]
TEST_SIZE: float = CONFIG["training"]["test_size"]
VAL_SIZE: float = CONFIG["training"]["val_size"]
N_SPLITS: int = CONFIG["training"]["n_splits"]

# ── Paths ────────────────────────────────────────────────────────────────────
DEMO_CSV_PATH: str = CONFIG["paths"]["demo_csv"]

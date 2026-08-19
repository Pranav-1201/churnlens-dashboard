"""Tests for the YAML-backed configuration loader (Phase 3 item 4).

Two jobs here:

1. **Regression lock.** Externalizing constants to `backend/config.yaml` must not
   change a single value. The literals asserted below are the ones that lived in
   `churn_intel/config.py` before the YAML existed; if the file drifts, these fail.
2. **Fail loudly.** A missing file, unparseable YAML, an absent key, or a
   wrong-typed value must raise `ConfigError` rather than silently falling back.
   A typo'd key that quietly trains against a stale default is the exact failure
   class this project's audit has been removing.
"""

import os

import numpy as np
import pytest
import yaml

from churn_intel.config import (
    COST_FN,
    COST_FP,
    DEFAULT_COST_RATIOS,
    DEMO_CSV_PATH,
    GROSS_MARGIN,
    N_SPLITS,
    OFFER_DURATION_MONTHS,
    RANDOM_STATE,
    RETENTION_DISCOUNT,
    TEST_SIZE,
    THRESHOLD_GRID,
    VAL_SIZE,
    ConfigError,
    load_config,
)


def _valid_config() -> dict:
    """A complete, well-formed config — the base for corruption in error tests."""
    return {
        "costs": {
            "cost_fn": 10_000,
            "cost_fp": 500,
            "gross_margin": 0.30,
            "retention_discount": 0.20,
            "offer_duration_months": 3,
        },
        "thresholds": {
            "grid": {"start": 0.01, "stop": 1.00, "step": 0.01},
            "default_cost_ratios": [1, 2, 3, 5, 8, 10, 15, 20, 30, 50, 75, 100],
        },
        "training": {
            "random_state": 42,
            "test_size": 0.2,
            "val_size": 0.2,
            "n_splits": 5,
        },
        "paths": {"demo_csv": "../data/telco_churn.csv"},
    }


def _write_config(tmp_path, cfg: dict):
    tmp_path.mkdir(parents=True, exist_ok=True)
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(cfg), encoding="utf-8")
    return path


# ── Regression lock: the YAML must reproduce the pre-existing constants ──


def test_cost_constants_match_pre_yaml_literals():
    assert COST_FN == 10_000
    assert COST_FP == 500


def test_cost_derivation_assumptions_match_pre_yaml_literals():
    assert GROSS_MARGIN == 0.30
    assert RETENTION_DISCOUNT == 0.20
    assert OFFER_DURATION_MONTHS == 3


def test_training_constants_match_pre_yaml_literals():
    assert RANDOM_STATE == 42
    assert TEST_SIZE == 0.2
    assert VAL_SIZE == 0.2
    assert N_SPLITS == 5


def test_default_cost_ratios_match_pre_yaml_literal():
    assert DEFAULT_COST_RATIOS == [1, 2, 3, 5, 8, 10, 15, 20, 30, 50, 75, 100]


def test_threshold_grid_matches_the_original_arange_expression():
    """The grid was `np.round(np.arange(0.01, 1.00, 0.01), 2)` — 99 points.

    Rebuilding it from start/stop/step in YAML must land on the identical array;
    `tests/test_threshold_curve.py` asserts the published curve has this length.
    """
    expected = np.round(np.arange(0.01, 1.00, 0.01), 2)
    assert len(THRESHOLD_GRID) == 99
    np.testing.assert_array_equal(THRESHOLD_GRID, expected)


def test_demo_csv_path_is_absolute_and_not_machine_specific():
    """The old value was the hardcoded 'D:/MLProject/data/telco_churn.csv'."""
    assert os.path.isabs(DEMO_CSV_PATH)
    assert os.path.exists(DEMO_CSV_PATH)
    assert os.path.basename(DEMO_CSV_PATH) == "telco_churn.csv"


# ── Fail loudly ──


def test_missing_file_raises_config_error(tmp_path):
    with pytest.raises(ConfigError):
        load_config(tmp_path / "does_not_exist.yaml")


def test_malformed_yaml_raises_config_error(tmp_path):
    bad = tmp_path / "config.yaml"
    bad.write_text("costs: {cost_fn: 1\n  broken: [", encoding="utf-8")
    with pytest.raises(ConfigError):
        load_config(bad)


def test_absent_key_raises_config_error(tmp_path):
    cfg = _valid_config()
    del cfg["costs"]["cost_fn"]
    with pytest.raises(ConfigError):
        load_config(_write_config(tmp_path, cfg))


def test_absent_section_raises_config_error(tmp_path):
    cfg = _valid_config()
    del cfg["training"]
    with pytest.raises(ConfigError):
        load_config(_write_config(tmp_path, cfg))


def test_wrong_typed_value_raises_config_error(tmp_path):
    cfg = _valid_config()
    cfg["costs"]["cost_fn"] = "ten thousand"
    with pytest.raises(ConfigError):
        load_config(_write_config(tmp_path, cfg))


def test_wrong_typed_ratio_list_raises_config_error(tmp_path):
    cfg = _valid_config()
    cfg["thresholds"]["default_cost_ratios"] = [1, "two", 3]
    with pytest.raises(ConfigError):
        load_config(_write_config(tmp_path, cfg))


# ── Path resolution ──


def test_env_var_overrides_the_default_config_path(tmp_path, monkeypatch):
    cfg = _valid_config()
    cfg["costs"]["cost_fn"] = 12_345
    monkeypatch.setenv("CHURN_CONFIG", str(_write_config(tmp_path, cfg)))
    assert load_config()["costs"]["cost_fn"] == 12_345


def test_explicit_path_wins_over_env_var(tmp_path, monkeypatch):
    env_cfg = _valid_config()
    env_cfg["costs"]["cost_fn"] = 111
    env_path = _write_config(tmp_path / "env", env_cfg)

    explicit_cfg = _valid_config()
    explicit_cfg["costs"]["cost_fn"] = 222
    explicit_path = _write_config(tmp_path / "explicit", explicit_cfg)

    monkeypatch.setenv("CHURN_CONFIG", str(env_path))
    assert load_config(explicit_path)["costs"]["cost_fn"] == 222


def test_demo_csv_resolves_relative_to_the_config_file_not_the_cwd(tmp_path, monkeypatch):
    """Tests run from the repo root, uvicorn runs from backend/ — a CWD-relative
    path would silently resolve differently depending on the caller."""
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "telco_churn.csv").write_text("x", encoding="utf-8")
    nested = tmp_path / "backend"
    nested.mkdir()

    cfg = _valid_config()
    path = nested / "config.yaml"
    path.write_text(yaml.safe_dump(cfg), encoding="utf-8")

    monkeypatch.chdir(tmp_path / "data")
    resolved = load_config(path)["paths"]["demo_csv"]
    assert resolved == str((tmp_path / "data" / "telco_churn.csv").resolve())

"""Tests for churn_intel.modeling.build_model_zoo.

The out-of-fold loop needs a brand-new, unfitted model for every fold, which is
why the zoo hands out builder callables instead of instances (sklearn's clone()
rejects CatBoostClassifier). These tests only BUILD models — nothing is trained,
so they stay in the fast suite.
"""

import pytest
from sklearn.exceptions import NotFittedError
from sklearn.utils.validation import check_is_fitted

from churn_intel import modeling

SCALE_POS_WEIGHT = 2.5
CAT_COLS = ["Contract", "gender"]


@pytest.fixture(scope="module")
def zoo():
    return modeling.build_model_zoo(SCALE_POS_WEIGHT, CAT_COLS)


def test_zoo_always_contains_the_three_core_models_first_and_stacking_last(zoo):
    names = [name for name, _, _ in zoo]
    assert names[:3] == ["Logistic Regression", "Decision Tree", "Random Forest"]
    assert names[-1] == "Stacked Model"


def test_optional_boosters_appear_exactly_when_installed(zoo):
    names = {name for name, _, _ in zoo}
    assert ("XGBoost (Calibrated)" in names) == modeling.HAS_XGB
    assert ("LightGBM" in names) == modeling.HAS_LGB
    assert ("CatBoost" in names) == modeling.HAS_CAT


def test_progress_percentages_strictly_increase(zoo):
    progress = [pct for _, pct, _ in zoo]
    assert progress == sorted(progress)
    assert len(set(progress)) == len(progress)


def test_every_builder_returns_a_new_object_on_each_call(zoo):
    for name, _, builder in zoo:
        first, second = builder(), builder()
        assert first is not second, name
        assert first.steps[-1][1] is not second.steps[-1][1], name


def test_every_builder_returns_an_unfitted_pipeline(zoo):
    for name, _, builder in zoo:
        try:
            check_is_fitted(builder())
        except NotFittedError:
            continue
        pytest.fail(f"{name} builder returned an already-fitted pipeline")


def test_scale_pos_weight_reaches_lightgbm(zoo):
    if not modeling.HAS_LGB:
        pytest.skip("lightgbm not installed")
    builder = dict((n, b) for n, _, b in zoo)["LightGBM"]
    assert builder().steps[-1][1].get_params()["scale_pos_weight"] == SCALE_POS_WEIGHT


def test_catboost_receives_categorical_columns_and_class_weights(zoo):
    if not modeling.HAS_CAT:
        pytest.skip("catboost not installed")
    builder = dict((n, b) for n, _, b in zoo)["CatBoost"]
    params = builder().steps[-1][1].get_params()
    assert params["cat_features"] == CAT_COLS
    assert params["class_weights"] == [1, SCALE_POS_WEIGHT]

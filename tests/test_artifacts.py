"""Tests for churn_intel.artifacts — saving, locating, loading and caching the
serialized model artifact.

The cache is module-global, and the predict tests rely on the real artifact
being cached, so every test starts from an empty cache and the previous
contents are restored afterwards.

Pickle is used deliberately: the artifact format IS a pickle (sklearn pipelines
have no JSON representation; see artifacts.py), and every pickle these tests
load was written moments earlier by the test itself into pytest's tmp_path —
nothing is loaded from an untrusted source.
"""

import pickle
import re
import subprocess

import numpy as np
import pytest

from churn_intel import artifacts


@pytest.fixture(autouse=True)
def isolated_cache():
    saved = dict(artifacts._cache)
    artifacts.clear_cache()
    yield
    artifacts.clear_cache()
    artifacts._cache.update(saved)


@pytest.fixture
def backend_dir(tmp_path, monkeypatch):
    """Point artifact lookup at a scratch backend/ directory."""
    backend = tmp_path / "backend"
    backend.mkdir()
    monkeypatch.setattr(artifacts, "_BACKEND_DIR", str(backend))
    return backend


def test_save_artifact_writes_all_three_parts(tmp_path):
    path = tmp_path / "m.pkl"
    artifacts.save_artifact(str(path), {"stub": 1}, 0.5, {"model_name": "RF"})

    with open(path, "rb") as f:
        saved = pickle.load(f)
    assert saved == {"pipeline": {"stub": 1}, "threshold": 0.5,
                     "metadata": {"model_name": "RF"}}


def test_save_artifact_stores_the_threshold_as_a_builtin_float(tmp_path):
    """A numpy scalar threshold must not leak into the pickle."""
    path = tmp_path / "m.pkl"
    artifacts.save_artifact(str(path), {"stub": 1}, np.float32(0.5), {})

    with open(path, "rb") as f:
        assert type(pickle.load(f)["threshold"]) is float


def test_save_artifact_creates_missing_directories(tmp_path):
    path = tmp_path / "does" / "not" / "exist" / "m.pkl"
    artifacts.save_artifact(str(path), {"stub": 1}, 0.4, {})
    assert path.exists()


def test_load_artifact_roundtrips_what_save_artifact_wrote(backend_dir):
    path = backend_dir / "models" / "churn_model.pkl"
    artifacts.save_artifact(str(path), {"stub": 2}, 0.35, {"model_name": "LR"})

    pipeline, threshold, metadata = artifacts.load_artifact()

    assert pipeline == {"stub": 2}
    assert threshold == 0.35
    assert metadata == {"model_name": "LR"}


def test_load_artifact_falls_back_to_the_repo_root_models_dir(backend_dir):
    path = backend_dir.parent / "models" / "churn_model.pkl"
    artifacts.save_artifact(str(path), {"stub": 3}, 0.6, {})

    assert artifacts.load_artifact()[1] == 0.6


def test_load_artifact_defaults_missing_metadata_to_empty(backend_dir):
    models = backend_dir / "models"
    models.mkdir()
    with open(models / "churn_model.pkl", "wb") as f:
        pickle.dump({"pipeline": {"stub": 4}, "threshold": 0.2}, f)

    assert artifacts.load_artifact()[2] == {}


def test_load_artifact_serves_from_cache_after_the_first_load(backend_dir):
    path = backend_dir / "models" / "churn_model.pkl"
    artifacts.save_artifact(str(path), {"stub": 5}, 0.45, {})
    first = artifacts.load_artifact()

    path.unlink()  # a second disk read would now raise FileNotFoundError

    assert artifacts.load_artifact() == first


def test_clear_cache_forces_a_reload_from_disk(backend_dir):
    path = backend_dir / "models" / "churn_model.pkl"
    artifacts.save_artifact(str(path), {"stub": 6}, 0.3, {})
    artifacts.load_artifact()

    artifacts.save_artifact(str(path), {"stub": 6}, 0.7, {})
    assert artifacts.load_artifact()[1] == 0.3  # still cached

    artifacts.clear_cache()
    assert artifacts.load_artifact()[1] == 0.7


def test_legacy_artifact_without_a_pipeline_is_rejected(backend_dir):
    models = backend_dir / "models"
    models.mkdir()
    with open(models / "churn_model.pkl", "wb") as f:
        pickle.dump({"model": "old-style", "threshold": 0.5}, f)

    with pytest.raises(ValueError, match="train.py"):
        artifacts.load_artifact()


def test_missing_artifact_raises_file_not_found(backend_dir):
    with pytest.raises(FileNotFoundError):
        artifacts.load_artifact()


def test_git_commit_reports_a_short_hash_inside_the_repo():
    assert re.fullmatch(r"[0-9a-f]{7,12}", artifacts._git_commit())


def test_git_commit_degrades_to_unknown_when_git_fails(monkeypatch):
    def broken_run(*args, **kwargs):
        raise subprocess.CalledProcessError(128, "git")

    monkeypatch.setattr(artifacts.subprocess, "run", broken_run)
    assert artifacts._git_commit() == "unknown"

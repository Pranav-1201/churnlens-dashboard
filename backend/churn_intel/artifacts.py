"""artifacts.py — save/load of the single serialized pipeline artifact.

Artifact format (written by save_artifact / train.py):
    {"pipeline": sklearn Pipeline (raw df in -> proba out),
     "threshold": float,
     "metadata": {model_name, feature_names, trained_at, git_commit, ...}}
"""

import logging
import os
import pickle
import subprocess

logger = logging.getLogger(__name__)

_cache: dict = {}

# backend/ — the directory that contains this package
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _artifact_path() -> str:
    candidates = [
        os.path.join(_BACKEND_DIR, "models", "churn_model.pkl"),
        os.path.join(_BACKEND_DIR, "..", "models", "churn_model.pkl"),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    raise FileNotFoundError(f"churn_model.pkl not found. Tried: {candidates}")


def load_artifact():
    """Returns (pipeline, threshold, metadata). Cached after first load."""
    if "pipeline" in _cache:
        return _cache["pipeline"], _cache["threshold"], _cache["metadata"]

    path = _artifact_path()
    # Pickle is safe here: the artifact is produced by our own train.py in this
    # repo and never accepted from users/network. sklearn pipelines require
    # binary serialization (no JSON-compatible representation exists).
    with open(path, "rb") as f:
        artifact = pickle.load(f)

    if not isinstance(artifact, dict) or "pipeline" not in artifact:
        raise ValueError(
            f"{path} is a legacy artifact without the full preprocessing pipeline. "
            "Regenerate it with: python backend/train.py"
        )

    _cache["pipeline"] = artifact["pipeline"]
    _cache["threshold"] = float(artifact["threshold"])
    _cache["metadata"] = artifact.get("metadata", {})

    meta = _cache["metadata"]
    logger.info("Loaded %s from %s (threshold=%s, trained_at=%s, commit=%s)",
                meta.get("model_name", "model"), path, _cache["threshold"],
                meta.get("trained_at", "?"), meta.get("git_commit", "?"))
    return _cache["pipeline"], _cache["threshold"], _cache["metadata"]


def clear_cache():
    """For tests: force a reload on next access."""
    _cache.clear()


def save_artifact(path, pipeline, threshold, metadata):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "wb") as f:
        pickle.dump({"pipeline": pipeline, "threshold": float(threshold), "metadata": metadata}, f)


def _git_commit() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=os.path.dirname(os.path.abspath(__file__)),
            capture_output=True, text=True, timeout=5, check=True,
        ).stdout.strip()
    except Exception:
        return "unknown"

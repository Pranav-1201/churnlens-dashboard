"""
model_loader.py — loads the single serialized pipeline artifact.

Artifact format (written by pipeline.save_artifact / train.py):
    {"pipeline": sklearn Pipeline (raw df in -> proba out),
     "threshold": float,
     "metadata": {model_name, feature_names, trained_at, git_commit, ...}}
"""

import os
import pickle

_cache: dict = {}


def _artifact_path() -> str:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(base_dir, "models", "churn_model.pkl"),
        os.path.join(base_dir, "..", "models", "churn_model.pkl"),
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
    print(f"[model_loader] Loaded {meta.get('model_name', 'model')} from {path} "
          f"(threshold={_cache['threshold']}, trained_at={meta.get('trained_at', '?')}, "
          f"commit={meta.get('git_commit', '?')})")
    return _cache["pipeline"], _cache["threshold"], _cache["metadata"]


def clear_cache():
    """For tests: force a reload on next access."""
    _cache.clear()

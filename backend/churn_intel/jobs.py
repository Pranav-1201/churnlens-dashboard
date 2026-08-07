"""jobs.py  —  In-memory async job tracker for ChurnLens
No Redis / Celery required. Stores up to MAX_JOBS jobs in a dict.
For multi-worker deployments, swap the dict for a Redis client.
"""

import threading
import time
import uuid
from typing import Optional

MAX_JOBS = 50   # LRU-style: oldest jobs evicted when limit reached

_store: dict[str, dict] = {}
_lock = threading.Lock()


# ──────────────────────────────────────────────
# Job lifecycle
# ──────────────────────────────────────────────

def create_job() -> str:
    job_id = str(uuid.uuid4())
    with _lock:
        if len(_store) >= MAX_JOBS:
            # evict oldest
            oldest = min(_store, key=lambda jid: _store[jid]["created_at"])
            del _store[oldest]
        _store[job_id] = {
            "status": "queued",       # queued | running | complete | failed
            "progress": 0,
            "current_step": "Queued",
            "logs": [],
            "results": None,
            "error": None,
            "created_at": time.time(),
            "completed_at": None,
        }
    return job_id


def update_progress(job_id: str, progress: int, step: str):
    with _lock:
        if job_id not in _store:
            return
        job = _store[job_id]
        job["progress"] = progress
        job["current_step"] = step
        job["status"] = "running"
        job["logs"].append({"time": round(time.time(), 2), "step": step, "progress": progress})


def mark_complete(job_id: str, results: dict):
    with _lock:
        if job_id not in _store:
            return
        job = _store[job_id]
        job["status"] = "complete"
        job["progress"] = 100
        job["current_step"] = "Complete"
        job["results"] = results
        job["completed_at"] = time.time()


def mark_failed(job_id: str, error: str):
    with _lock:
        if job_id not in _store:
            return
        job = _store[job_id]
        job["status"] = "failed"
        job["error"] = error
        job["current_step"] = "Failed"
        job["completed_at"] = time.time()


def get_status(job_id: str) -> Optional[dict]:
    with _lock:
        job = _store.get(job_id)
        if not job:
            return None
        # Return status without the full results payload (use /results endpoint for that)
        return {
            "job_id": job_id,
            "status": job["status"],
            "progress": job["progress"],
            "current_step": job["current_step"],
            "logs": job["logs"][-20:],   # last 20 log lines
            "error": job["error"],
            "elapsed": round(time.time() - job["created_at"], 1) if job["created_at"] else None,
        }


def get_results(job_id: str) -> Optional[dict]:
    with _lock:
        job = _store.get(job_id)
        if not job:
            return None
        return job["results"]

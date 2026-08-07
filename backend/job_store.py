"""Compat shim — the real module is churn_intel.jobs."""

from churn_intel.jobs import (  # noqa: F401
    MAX_JOBS,
    create_job,
    get_results,
    get_status,
    mark_complete,
    mark_failed,
    update_progress,
)

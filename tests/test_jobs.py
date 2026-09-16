"""Tests for churn_intel.jobs — the in-memory job tracker behind /run-pipeline.

The store is module-global mutable state, so every test runs against an empty
store and the previous contents are restored afterwards.
"""

import pytest

from churn_intel import jobs


@pytest.fixture(autouse=True)
def isolated_store():
    saved = dict(jobs._store)
    jobs._store.clear()
    yield
    jobs._store.clear()
    jobs._store.update(saved)


def test_new_job_starts_queued_with_no_progress():
    job_id = jobs.create_job()
    status = jobs.get_status(job_id)

    assert status["job_id"] == job_id
    assert status["status"] == "queued"
    assert status["progress"] == 0
    assert status["current_step"] == "Queued"
    assert status["logs"] == []
    assert status["error"] is None
    assert jobs.get_results(job_id) is None


def test_update_progress_marks_running_and_appends_a_log_entry():
    job_id = jobs.create_job()
    jobs.update_progress(job_id, 40, "Training models")
    status = jobs.get_status(job_id)

    assert status["status"] == "running"
    assert status["progress"] == 40
    assert status["current_step"] == "Training models"
    assert len(status["logs"]) == 1
    assert status["logs"][0]["step"] == "Training models"
    assert status["logs"][0]["progress"] == 40


def test_mark_complete_stores_results_and_finishes_at_100():
    job_id = jobs.create_job()
    jobs.update_progress(job_id, 90, "Almost there")
    jobs.mark_complete(job_id, {"best_model": "Random Forest"})
    status = jobs.get_status(job_id)

    assert status["status"] == "complete"
    assert status["progress"] == 100
    assert status["current_step"] == "Complete"
    assert jobs.get_results(job_id) == {"best_model": "Random Forest"}


def test_status_payload_never_carries_the_results():
    """Results are served by /results; /pipeline-status must stay small."""
    job_id = jobs.create_job()
    jobs.mark_complete(job_id, {"huge": list(range(1000))})
    assert "results" not in jobs.get_status(job_id)


def test_mark_failed_records_the_error_and_keeps_no_results():
    job_id = jobs.create_job()
    jobs.mark_failed(job_id, "boom")
    status = jobs.get_status(job_id)

    assert status["status"] == "failed"
    assert status["error"] == "boom"
    assert status["current_step"] == "Failed"
    assert jobs.get_results(job_id) is None


def test_unknown_job_id_returns_none_from_both_getters():
    assert jobs.get_status("no-such-job") is None
    assert jobs.get_results("no-such-job") is None


def test_mutators_ignore_unknown_job_ids_without_creating_entries():
    jobs.update_progress("ghost", 10, "x")
    jobs.mark_complete("ghost", {"a": 1})
    jobs.mark_failed("ghost", "err")
    assert jobs._store == {}


def test_status_logs_are_truncated_to_the_last_20():
    job_id = jobs.create_job()
    for i in range(25):
        jobs.update_progress(job_id, i, f"step {i}")
    logs = jobs.get_status(job_id)["logs"]

    assert len(logs) == 20
    # 25 updates numbered 0..24; the last 20 are 5..24.
    assert [entry["progress"] for entry in logs] == list(range(5, 25))


def test_store_evicts_the_oldest_job_when_full(monkeypatch):
    monkeypatch.setattr(jobs, "MAX_JOBS", 3)
    first, second, third = jobs.create_job(), jobs.create_job(), jobs.create_job()
    # Pin distinct creation times. Windows' clock can hand back identical
    # time.time() values in a tight loop, and on a tie min() and max() both pick
    # the first-inserted job — which would let an "evict the newest" bug pass.
    for offset, job_id in enumerate((first, second, third)):
        jobs._store[job_id]["created_at"] = 1000.0 + offset

    fourth = jobs.create_job()

    assert len(jobs._store) == 3
    assert jobs.get_status(first) is None
    for survivor in (second, third, fourth):
        assert jobs.get_status(survivor) is not None

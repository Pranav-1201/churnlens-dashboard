"""catboost_thread_check.py — Phase 6.2 (HANDOFF.md section 4, item 2):
"re-test the CatBoost background-thread deadlock on Linux (subprocess
fallback if it persists)."

backend/seed_demo_run.py's docstring records that CatBoost hangs when
trained inside FastAPI's background-task thread on the Windows dev
machine, which is why seed_demo_run.py skips it. That was never re-tested
on Linux, the actual deploy target (backend/Dockerfile runs
python:3.11-slim). This script exercises the real dispatch path — an
actual FastAPI app, an actual BackgroundTasks-queued job, an actual
CatBoostClassifier.fit() — via Starlette's real sync-background-task
machinery (BackgroundTask.__call__ calls run_in_threadpool for a sync
function, i.e. anyio's worker-thread pool; TestClient exercises that same
code path, not a simplified stand-in for it).

A single fit() did NOT reproduce a hang when tried locally on Windows,
contradicting the plain reading of seed_demo_run.py's docstring — so this
mirrors churn_intel.modeling.oof_probabilities' actual call pattern
instead: 5-fold OOF (5 sequential fits) plus one final fit on the full
training split, 6 CatBoostClassifier.fit() calls in the same background
thread, matching what run_pipeline actually does.

faulthandler.dump_traceback_later() is the actual deadlock detector: if
the process is still alive after TIMEOUT_S, it dumps every thread's stack
and hard-exits(1), regardless of which thread is stuck. That turns a
silent hang into a diagnosable CI failure instead of the job running until
the workflow's default multi-hour timeout with no information.

Exit 0: the fit completed within the timeout — no deadlock on this
platform. Exit 1: it did not (see the dumped stacks in the CI log for
which thread is stuck), or it raised a real (non-hang) exception.
"""
import faulthandler
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

TIMEOUT_S = 60


def main() -> None:
    import numpy as np
    import pandas as pd
    from catboost import CatBoostClassifier
    from fastapi import BackgroundTasks, FastAPI
    from fastapi.testclient import TestClient
    from sklearn.model_selection import StratifiedKFold

    # Small synthetic dataset — this check is about the threading model,
    # not about training a real model, so keep it fast.
    rng = np.random.RandomState(42)
    n = 600
    df = pd.DataFrame({
        "num_a": rng.normal(size=n),
        "num_b": rng.normal(size=n),
        "cat_a": rng.choice(["x", "y", "z"], size=n).astype(str),
    })
    y = rng.randint(0, 2, size=n)

    result: dict = {}

    def fit_job() -> None:
        try:
            # churn_intel.modeling.oof_probabilities' pattern: 5-fold OOF
            # (5 fits), then one more fit on the full training split — 6
            # sequential CatBoostClassifier.fit() calls in this thread.
            skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
            for tr_idx, va_idx in skf.split(df, y):
                m = CatBoostClassifier(
                    iterations=50, depth=4, verbose=False, allow_writing_files=False,
                )
                m.fit(df.iloc[tr_idx], y[tr_idx], cat_features=["cat_a"])
                m.predict_proba(df.iloc[va_idx])
            final = CatBoostClassifier(
                iterations=50, depth=4, verbose=False, allow_writing_files=False,
            )
            final.fit(df, y, cat_features=["cat_a"])
            result["ok"] = True
        except Exception as e:  # noqa: BLE001 — deliberately broad: this is a diagnostic
            result["ok"] = False
            result["error"] = repr(e)

    app = FastAPI()

    @app.post("/fit")
    def fit(background_tasks: BackgroundTasks):
        background_tasks.add_task(fit_job)
        return {"queued": True}

    client = TestClient(app)

    faulthandler.dump_traceback_later(TIMEOUT_S, exit=True)
    t0 = time.time()
    client.post("/fit")  # blocks until the background task finishes (or the watchdog fires)
    elapsed = time.time() - t0
    faulthandler.cancel_dump_traceback_later()

    if not result.get("ok"):
        print(f"FAILED (not a deadlock, raised instead): {result.get('error')}")
        sys.exit(1)

    print(
        f"OK: 6 sequential CatBoost.fit() calls (5-fold OOF + final) inside "
        f"a FastAPI background task completed in {elapsed:.1f}s -- no "
        f"deadlock on this platform "
        f"(python={sys.version.split()[0]}, platform={sys.platform})."
    )
    sys.exit(0)


if __name__ == "__main__":
    main()

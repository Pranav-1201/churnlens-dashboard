"""Access control for the state-changing endpoints (/run-pipeline, /upload).

Two independent dependencies, applied in this order:

* require_writable — CHURNLENS_READ_ONLY (default: on in production, see settings.py)
  refuses every write route with 403, so a public read-only deployment cannot be made to
  train or ingest anything, whatever keys exist.
* require_api_key — when CHURNLENS_API_KEY is set, a matching X-API-Key header is
  required (401 otherwise). When it is NOT set: open in dev (main.py logs a warning at
  startup), but FAIL CLOSED with 503 in production, so forgetting the key can never
  silently expose a training endpoint.

Both read the environment on every call rather than caching it at import, so tests can
monkeypatch os.environ directly without reloading this module.
"""
import hmac
import os

from fastapi import Header, HTTPException

from . import settings


def require_writable() -> None:
    """FastAPI dependency: refuse write endpoints on a read-only deployment."""
    if settings.read_only():
        raise HTTPException(
            status_code=403,
            detail="Write endpoints are disabled: this deployment is read-only",
        )


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """FastAPI dependency: enforce X-API-Key (fail closed in production)."""
    expected = os.environ.get("CHURNLENS_API_KEY")
    if not expected:
        if settings.is_production():
            raise HTTPException(
                status_code=503,
                detail="Server misconfigured: CHURNLENS_API_KEY is required in production",
            )
        return
    # compare_digest avoids leaking the key one character at a time through timing.
    if x_api_key is None or not hmac.compare_digest(
        x_api_key.encode("utf-8"), expected.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="Missing or invalid X-API-Key")

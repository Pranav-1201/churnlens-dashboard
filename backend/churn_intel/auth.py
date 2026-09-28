"""API-key auth for state-changing endpoints (Phase 6.2, HANDOFF.md §4.2:
"an API-key header on /run-pipeline and /upload").

CHURNLENS_API_KEY unset: auth is disabled (dev-friendly default; main.py
logs a loud warning at startup so this doesn't go unnoticed in a real
deploy). Set: every request to a protected endpoint must send a matching
X-API-Key header or gets 401.

Reads the environment on every call rather than caching it at import, so
tests can monkeypatch os.environ directly without reloading this module.
"""
import os

from fastapi import Header, HTTPException


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """FastAPI dependency: enforce X-API-Key when CHURNLENS_API_KEY is set."""
    expected = os.environ.get("CHURNLENS_API_KEY")
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Missing or invalid X-API-Key")

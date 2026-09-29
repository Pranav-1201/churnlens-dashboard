"""settings.py — deployment settings read from the environment (Phase B).

Distinct from config.py, which loads model/cost settings from config.yaml. Everything here
is read on EVERY call, never cached at import (same convention as auth.py), so tests can
monkeypatch os.environ directly and a value never goes stale.

Variables:
  CHURNLENS_ENV                 "production" turns on the safe defaults below.
  CHURNLENS_READ_ONLY           1/true/yes/on or 0/false/no/off. Unset: read-only exactly
                                when CHURNLENS_ENV=production.
  CORS_ORIGINS                  Comma-separated allowed browser origins. "*" is rejected
                                (credentials are enabled, so a wildcard is invalid anyway).
  CHURNLENS_MAX_UPLOAD_BYTES    Cap for uploaded CSVs (default 10 MB).
"""
import os

# The origins the project itself serves a frontend from: the Vite dev server, the
# alternative dev port, the docker-compose frontend, and `vite preview`.
DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8080",
    "http://localhost:4173",
)

DEFAULT_MAX_UPLOAD_BYTES = 10_000_000

_TRUE = {"1", "true", "yes", "on"}
_FALSE = {"0", "false", "no", "off"}


def is_production() -> bool:
    return os.environ.get("CHURNLENS_ENV", "").strip().lower() == "production"


def read_only() -> bool:
    """True when the write endpoints (/run-pipeline, /upload) must be refused."""
    raw = os.environ.get("CHURNLENS_READ_ONLY")
    if raw is None or not raw.strip():
        return is_production()
    value = raw.strip().lower()
    if value in _TRUE:
        return True
    if value in _FALSE:
        return False
    raise ValueError(f"CHURNLENS_READ_ONLY must be one of {sorted(_TRUE | _FALSE)}, got {raw!r}")


def docs_enabled() -> bool:
    """Interactive API docs (/docs, /redoc, /openapi.json) are hidden in production."""
    return not is_production()


def cors_origins() -> list[str]:
    raw = os.environ.get("CORS_ORIGINS")
    if raw is None or not raw.strip():
        return list(DEFAULT_CORS_ORIGINS)
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    if "*" in origins:
        raise ValueError(
            "CORS_ORIGINS must list explicit origins; '*' is not allowed because "
            "credentials are enabled"
        )
    return origins


def max_upload_bytes() -> int:
    raw = os.environ.get("CHURNLENS_MAX_UPLOAD_BYTES")
    if raw is None or not raw.strip():
        return DEFAULT_MAX_UPLOAD_BYTES
    value = int(raw)
    if value <= 0:
        raise ValueError("CHURNLENS_MAX_UPLOAD_BYTES must be a positive integer")
    return value

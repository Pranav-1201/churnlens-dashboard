# ChurnLens API image. Build from the repo root so this can COPY
# requirements.txt, backend/, models/ and data/ in one context:
#   docker build -f backend/Dockerfile -t churnlens-backend .
FROM python:3.11-slim

# libgomp1 is required at runtime by xgboost/lightgbm/catboost (OpenMP).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Surfaced by GET /health as app_git_commit (Phase 6.3) — pass at build time:
#   docker build --build-arg GIT_SHA=$(git rev-parse --short HEAD) ...
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}

# Runtime deps only — requirements.txt, not requirements-dev.txt. torch,
# jupyter and friends are research/notebook-only and are never imported on
# this path (see requirements.txt's own header).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ backend/
COPY models/ models/
COPY data/ data/

RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

WORKDIR /app/backend
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8000/health', timeout=3)" || exit 1

# --workers 1: the in-memory job tracker and models/last_run.json warm-start
# file are single-process state (see DEPLOYMENT.md — Phase 6.2). Running more
# than one worker here silently splits that state across processes.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

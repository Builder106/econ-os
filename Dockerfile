# EconOS kernel container — runs the shared MarketEnv + WS API.
# Koyeb (and any container host) sets $PORT; uvicorn binds to it.

FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install Python deps first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the kernel and the simulation core. Dashboard is shipped via Vercel in
# the split-host deploy, but we bundle it here too so this image works
# standalone (visiting the kernel URL directly serves the same UI).
COPY simulation/ simulation/
COPY server/ server/
COPY dashboard/ dashboard/

ENV PORT=8000
EXPOSE 8000

# Honor $PORT (Koyeb / Cloud Run / Railway all set it). Single worker — the
# kernel state must live in one process.
CMD ["sh", "-c", "exec python -m uvicorn server.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --log-level warning"]

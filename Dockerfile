# EconOS kernel container — runs the shared MarketEnv + WS API.
# Koyeb (and any container host) sets $PORT; uvicorn binds to it.

# Build the static desktop. ECONOS_KERNEL_WS_URL stays empty, so the desktop talks to
# the kernel that serves it.
FROM node:24-slim AS desktop
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY desktop/ desktop/
RUN npm run build

FROM python:3.14-slim AS base
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app
 
# Install build tools for C wheels (e.g. tinyscaler on arm64)
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential gcc && \
    rm -rf /var/lib/apt/lists/*

# Install Python deps first for better layer caching.
COPY pyproject.toml uv.lock ./
RUN uv pip install --system --no-cache .

# Copy the kernel and the simulation core. The desktop is shipped via Vercel in
# the split-host deploy, but we bundle it here too so this image works
# standalone (visiting the kernel URL directly serves the same UI).
COPY simulation/ simulation/
COPY server/ server/
COPY --from=desktop /build/desktop/dist desktop/dist
# Trained PPO checkpoints (consumer_policy.zip / producer_policy.zip). The
# kernel's _try_load_ppo() falls back to random actions if these are absent,
# so the build is safe even on a fresh clone before training has run — but if
# the checkpoints exist in the build context, they need to be in the image
# for policies_loaded to flip true.
COPY models/ models/

ENV PORT=8000
EXPOSE 8000

# Honor $PORT (Koyeb / Cloud Run / Railway all set it). Single worker — the
# kernel state must live in one process.
CMD ["sh", "-c", "exec python -m uvicorn server.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --log-level warning"]

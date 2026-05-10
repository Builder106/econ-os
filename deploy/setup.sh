#!/usr/bin/env bash
# One-shot bootstrap for an Oracle Always Free VM (Ubuntu 22.04 / 24.04).
# Run once after SSH'ing into a fresh instance, with the repo already cloned.
#
# Idempotent: safe to re-run.
#
# Tailscale Funnel deploy: Tailscale (installed on the host) terminates TLS at
# Tailscale's edge and proxies https://<host>.<tailnet>.ts.net → 127.0.0.1:8000.
# No inbound ports needed on the VM. Free static URL, browser-trusted cert.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="${REPO_DIR}/deploy"

echo "[econos] repo:   ${REPO_DIR}"
echo "[econos] deploy: ${DEPLOY_DIR}"

# 1. Install Docker + compose plugin if missing.
if ! command -v docker >/dev/null 2>&1; then
    echo "[econos] installing Docker..."
    sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
        | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update -y
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker "$USER"
    echo "[econos] you may need to 'newgrp docker' or log out and back in for non-sudo docker."
fi

# 2. Install Tailscale if missing.
if ! command -v tailscale >/dev/null 2>&1; then
    echo "[econos] installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
fi

# 3. Set up env file if it doesn't exist.
ENV_FILE="${DEPLOY_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
    cp "${DEPLOY_DIR}/.env.example" "${ENV_FILE}"
    echo "[econos] created ${ENV_FILE} from .env.example."
    echo "[econos] EDIT IT NOW (set ADMIN_TOKEN), then re-run this script."
    exit 0
fi

# Sanity-check the env file before bringing the stack up.
# shellcheck disable=SC1090
set -a; . "${ENV_FILE}"; set +a
if [ -z "${ADMIN_TOKEN:-}" ]; then
    echo "[econos] ADMIN_TOKEN is empty in ${ENV_FILE}. Edit and re-run."
    exit 1
fi

# 4. Build and start the kernel container.
echo "[econos] starting kernel container..."
cd "${DEPLOY_DIR}"
sudo docker compose build kernel
sudo docker compose up -d

# 5. Tailscale auth + Funnel setup.
TS_STATUS=$(sudo tailscale status --json 2>/dev/null || echo '{}')
if ! echo "$TS_STATUS" | grep -q '"BackendState":\s*"Running"'; then
    echo
    echo "============================================================"
    echo "  [!] Tailscale not authenticated yet."
    echo "  Run:  sudo tailscale up"
    echo "  Visit the URL it prints, log in, then re-run this script."
    echo "============================================================"
    exit 0
fi

echo "[econos] Tailscale authenticated. Configuring Funnel..."
# Reset any prior serve/funnel config so re-runs are clean.
sudo tailscale serve reset 2>/dev/null || true
# Modern unified syntax (Tailscale 1.50+): one command sets up serve AND funnel.
# Proxies https://<host>.<tailnet>.ts.net/ → http://127.0.0.1:8000 publicly.
sudo tailscale funnel --bg http://127.0.0.1:8000 >/dev/null

PUBLIC_URL=$(sudo tailscale funnel status 2>/dev/null | grep -oE 'https://[^ ]+' | head -1 || true)
if [ -z "$PUBLIC_URL" ]; then
    PUBLIC_URL="https://$(sudo tailscale status --json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["Self"]["DNSName"].rstrip("."))')"
fi

echo
echo "============================================================"
echo "  [OK] EconOS kernel up via Tailscale Funnel"
echo "  Public URL: ${PUBLIC_URL}"
echo "  Verify:    curl ${PUBLIC_URL}/healthz"
echo "  Logs:      sudo docker compose -f ${DEPLOY_DIR}/docker-compose.yml logs -f"
echo "============================================================"

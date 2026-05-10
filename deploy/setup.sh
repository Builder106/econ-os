#!/usr/bin/env bash
# One-shot bootstrap for an Oracle Always Free VM (Ubuntu 22.04 / 24.04).
# Run once after SSH'ing into a fresh instance, with the repo already cloned.
#
# Idempotent: safe to re-run.
#
# Cloudflare Tunnel deploy: cloudflared opens an outbound connection to
# Cloudflare's edge — no inbound ports needed on the VM. Configure the tunnel
# in the Cloudflare Zero Trust dashboard *before* running this, and paste the
# tunnel token into deploy/.env.

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

# 2. Set up env file if it doesn't exist.
ENV_FILE="${DEPLOY_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
    cp "${DEPLOY_DIR}/.env.example" "${ENV_FILE}"
    echo "[econos] created ${ENV_FILE} from .env.example."
    echo "[econos] EDIT IT NOW (set TUNNEL_TOKEN, ADMIN_TOKEN), then re-run this script."
    exit 0
fi

# Sanity-check the env file before bringing the stack up.
# shellcheck disable=SC1090
set -a; . "${ENV_FILE}"; set +a
if [ -z "${TUNNEL_TOKEN:-}" ] || [ -z "${ADMIN_TOKEN:-}" ]; then
    echo "[econos] TUNNEL_TOKEN or ADMIN_TOKEN is empty in ${ENV_FILE}. Edit and re-run."
    exit 1
fi

# 3. Build and start the stack.
echo "[econos] starting stack..."
cd "${DEPLOY_DIR}"
sudo docker compose pull cloudflared
sudo docker compose build kernel
sudo docker compose up -d

echo
echo "[econos] up. cloudflared is connecting outbound to Cloudflare's edge."
echo "[econos] your hostname (configured in Cloudflare Zero Trust) should serve traffic shortly."
echo "[econos] logs:   sudo docker compose -f ${DEPLOY_DIR}/docker-compose.yml logs -f"

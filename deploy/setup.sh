#!/usr/bin/env bash
# One-shot bootstrap for an Oracle Always Free VM (Ubuntu 22.04 / 24.04).
# Run once after SSH'ing into a fresh instance, with the repo already cloned.
#
# Idempotent: safe to re-run. Does NOT touch DNS — point your domain at the
# VM's public IP separately before running, otherwise Caddy can't issue a cert.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="${REPO_DIR}/deploy"

echo "[econos] repo:   ${REPO_DIR}"
echo "[econos] deploy: ${DEPLOY_DIR}"

# 1. Open ports 80/443 in iptables. Oracle's Ubuntu image ships with iptables
#    rules that drop everything except SSH — a known footgun. Insert at top so
#    we beat the existing REJECT rules. netfilter-persistent saves them.
echo "[econos] opening ports 80/443 in iptables..."
sudo iptables -C INPUT -p tcp --dport 80  -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 80  -j ACCEPT
sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
if ! command -v netfilter-persistent >/dev/null 2>&1; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
fi
sudo netfilter-persistent save

# 2. Install Docker + compose plugin if missing.
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

# 3. Set up env file if it doesn't exist.
ENV_FILE="${DEPLOY_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
    cp "${DEPLOY_DIR}/.env.example" "${ENV_FILE}"
    echo "[econos] created ${ENV_FILE} from .env.example."
    echo "[econos] EDIT IT NOW (set ECONOS_DOMAIN, ADMIN_TOKEN), then re-run this script."
    exit 0
fi

# Sanity-check the env file before bringing the stack up.
# shellcheck disable=SC1090
set -a; . "${ENV_FILE}"; set +a
if [ -z "${ECONOS_DOMAIN:-}" ] || [ -z "${ADMIN_TOKEN:-}" ]; then
    echo "[econos] ECONOS_DOMAIN or ADMIN_TOKEN is empty in ${ENV_FILE}. Edit and re-run."
    exit 1
fi

# 4. Build and start the stack.
echo "[econos] starting stack for ${ECONOS_DOMAIN}..."
cd "${DEPLOY_DIR}"
sudo docker compose pull caddy
sudo docker compose build kernel
sudo docker compose up -d

echo
echo "[econos] up. Caddy will issue HTTPS for ${ECONOS_DOMAIN} on first hit."
echo "[econos] verify: curl https://${ECONOS_DOMAIN}/healthz"
echo "[econos] logs:   sudo docker compose -f ${DEPLOY_DIR}/docker-compose.yml logs -f"

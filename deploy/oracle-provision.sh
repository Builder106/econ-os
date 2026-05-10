#!/usr/bin/env bash
# One-shot Oracle Always Free provisioner for the EconOS kernel.
# Reads tenancy/region from ~/.oci/config; creates a dedicated VCN/subnet/IGW,
# launches an E2.1 Micro instance, and writes deploy/oci-state.json with the
# OCIDs and public IP for later teardown.
#
# Refuses to run if deploy/oci-state.json already exists — `rm` it to re-provision.

set -euo pipefail

# Tame OCI CLI's Python 3.14 SyntaxWarning noise.
export PYTHONWARNINGS="ignore::SyntaxWarning"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_FILE="${REPO_DIR}/deploy/oci-state.json"

if [ -f "${STATE_FILE}" ]; then
    echo "[econos] ${STATE_FILE} already exists — refusing to provision again." >&2
    echo "[econos] Remove it (or run a teardown) before re-running." >&2
    exit 1
fi

SSH_KEY_FILE="${SSH_KEY_FILE:-$HOME/.ssh/id_ed25519.pub}"
if [ ! -f "${SSH_KEY_FILE}" ]; then
    echo "[econos] SSH key ${SSH_KEY_FILE} not found." >&2
    exit 1
fi

TENANCY=$(grep '^tenancy=' ~/.oci/config | head -1 | cut -d= -f2 | tr -d '\r\n')
REGION=$(grep   '^region='   ~/.oci/config | head -1 | cut -d= -f2 | tr -d '\r\n')
SSH_KEY=$(cat "${SSH_KEY_FILE}")

SHAPE="${SHAPE:-VM.Standard.E2.1.Micro}"
NAME_PREFIX="${NAME_PREFIX:-econos}"

# Auto-detect an AD that actually offers $SHAPE (Oracle scatters availability
# unevenly across ADs — E2.1.Micro often only lives in one AD per region).
if [ -z "${AD:-}" ]; then
    for CAND in $(oci iam availability-domain list -c "$TENANCY" --query 'data[].name' --output json | python3 -c "import json,sys; [print(x) for x in json.load(sys.stdin)['data']]"); do
        if oci compute shape list -c "$TENANCY" --availability-domain "$CAND" --query "data[?shape=='$SHAPE'].shape" --raw-output 2>/dev/null | grep -q "$SHAPE"; then
            AD="$CAND"
            echo "[econos] auto-selected AD ${AD} (offers ${SHAPE})"
            break
        fi
    done
    if [ -z "${AD:-}" ]; then
        echo "[econos] ${SHAPE} is not available in any AD of ${REGION}." >&2
        exit 1
    fi
fi

echo "[econos] tenancy   ${TENANCY:0:35}…"
echo "[econos] region    ${REGION}"
echo "[econos] AD        ${AD}"
echo "[econos] ssh key   ${SSH_KEY_FILE}"
echo

# 1. VCN
echo "[1/8] creating VCN ${NAME_PREFIX}-vcn..."
VCN_ID=$(oci network vcn create \
    -c "$TENANCY" \
    --display-name "${NAME_PREFIX}-vcn" \
    --cidr-block 10.10.0.0/16 \
    --dns-label "${NAME_PREFIX}" \
    --wait-for-state AVAILABLE \
    --query 'data.id' --raw-output)
echo "      ${VCN_ID}"

# 2. Internet Gateway
echo "[2/8] creating Internet Gateway..."
IGW_ID=$(oci network internet-gateway create \
    -c "$TENANCY" \
    --vcn-id "$VCN_ID" \
    --display-name "${NAME_PREFIX}-igw" \
    --is-enabled true \
    --wait-for-state AVAILABLE \
    --query 'data.id' --raw-output)
echo "      ${IGW_ID}"

# 3. Default route table → 0.0.0.0/0 via IGW
echo "[3/8] updating default route table..."
RT_ID=$(oci network vcn get --vcn-id "$VCN_ID" --query 'data."default-route-table-id"' --raw-output)
oci network route-table update \
    --rt-id "$RT_ID" \
    --route-rules "[{\"destination\": \"0.0.0.0/0\", \"destinationType\": \"CIDR_BLOCK\", \"networkEntityId\": \"$IGW_ID\"}]" \
    --force >/dev/null

# 4. Default security list → ingress 22 / 80 / 443
echo "[4/8] adding ingress rules (22, 80, 443)..."
SL_ID=$(oci network vcn get --vcn-id "$VCN_ID" --query 'data."default-security-list-id"' --raw-output)
oci network security-list update \
    --security-list-id "$SL_ID" \
    --ingress-security-rules '[
        {"source": "0.0.0.0/0", "protocol": "6", "isStateless": false, "tcpOptions": {"destinationPortRange": {"min": 22,  "max": 22}}},
        {"source": "0.0.0.0/0", "protocol": "6", "isStateless": false, "tcpOptions": {"destinationPortRange": {"min": 80,  "max": 80}}},
        {"source": "0.0.0.0/0", "protocol": "6", "isStateless": false, "tcpOptions": {"destinationPortRange": {"min": 443, "max": 443}}}
    ]' \
    --force >/dev/null

# 5. Subnet
echo "[5/8] creating subnet..."
SUBNET_ID=$(oci network subnet create \
    -c "$TENANCY" \
    --vcn-id "$VCN_ID" \
    --display-name "${NAME_PREFIX}-subnet" \
    --cidr-block 10.10.1.0/24 \
    --availability-domain "$AD" \
    --dns-label "${NAME_PREFIX}sub" \
    --wait-for-state AVAILABLE \
    --query 'data.id' --raw-output)
echo "      ${SUBNET_ID}"

# 6. Latest Ubuntu 22.04 image OCID for the shape
echo "[6/8] looking up Canonical Ubuntu 22.04 image..."
IMG_ID=$(oci compute image list \
    -c "$TENANCY" \
    --operating-system "Canonical Ubuntu" \
    --operating-system-version "22.04" \
    --shape VM.Standard.E2.1.Micro \
    --sort-by TIMECREATED --sort-order DESC \
    --limit 1 \
    --query 'data[0].id' --raw-output)
echo "      ${IMG_ID}"

# 7. Launch (A1.Flex requires explicit --shape-config for OCPUs/memory)
echo "[7/8] launching instance (1–3 min)..."
INSTANCE_ID=$(oci compute instance launch \
    -c "$TENANCY" \
    --availability-domain "$AD" \
    --shape "$SHAPE" \
    --image-id "$IMG_ID" \
    --subnet-id "$SUBNET_ID" \
    --display-name "${NAME_PREFIX}-kernel" \
    --assign-public-ip true \
    --metadata "{\"ssh_authorized_keys\": \"$SSH_KEY\"}" \
    --wait-for-state RUNNING \
    --query 'data.id' --raw-output)
echo "      ${INSTANCE_ID}"

# 8. Public IP via VNIC
echo "[8/8] resolving public IP..."
VNIC_ID=$(oci compute instance list-vnics --instance-id "$INSTANCE_ID" --query 'data[0].id' --raw-output)
PUBLIC_IP=$(oci network vnic get --vnic-id "$VNIC_ID" --query 'data."public-ip"' --raw-output)

# Persist OCIDs for teardown / re-deploy.
mkdir -p "${REPO_DIR}/deploy"
cat > "${STATE_FILE}" <<EOF
{
  "tenancy_id": "${TENANCY}",
  "region": "${REGION}",
  "availability_domain": "${AD}",
  "vcn_id": "${VCN_ID}",
  "internet_gateway_id": "${IGW_ID}",
  "subnet_id": "${SUBNET_ID}",
  "instance_id": "${INSTANCE_ID}",
  "image_id": "${IMG_ID}",
  "shape": "VM.Standard.E2.1.Micro",
  "ssh_user": "ubuntu",
  "ssh_key_file": "${SSH_KEY_FILE}",
  "public_ip": "${PUBLIC_IP}"
}
EOF

echo
echo "=========================================="
echo "  ✔ provisioned"
echo "  shape     VM.Standard.E2.1.Micro"
echo "  public IP ${PUBLIC_IP}"
echo "  ssh       ssh ubuntu@${PUBLIC_IP}"
echo "  state     deploy/oci-state.json"
echo "=========================================="

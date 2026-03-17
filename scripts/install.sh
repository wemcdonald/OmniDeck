#!/usr/bin/env bash
set -euo pipefail

# Install OmniDeck Hub on a Raspberry Pi.
# Copies built files to /opt/omnideck, installs dependencies,
# and enables the systemd service.
# Run as root (or via sudo) after pi-setup.sh has been executed.

OMNIDECK_USER="${OMNIDECK_USER:-pi}"
OMNIDECK_DIR="/opt/omnideck"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_SRC="${REPO_ROOT}/deploy/omnideck-hub.service"
SERVICE_NAME="omnideck-hub"

echo "==> Copying hub files to ${OMNIDECK_DIR}..."
mkdir -p "${OMNIDECK_DIR}/hub"
cp -r "${REPO_ROOT}/hub/dist" "${OMNIDECK_DIR}/hub/dist"
cp "${REPO_ROOT}/hub/package.json" "${OMNIDECK_DIR}/hub/package.json"
cp "${REPO_ROOT}/hub/pnpm-lock.yaml" "${OMNIDECK_DIR}/hub/pnpm-lock.yaml" 2>/dev/null || true

echo "==> Installing production dependencies..."
cd "${OMNIDECK_DIR}/hub"
pnpm install --prod --frozen-lockfile

echo "==> Setting file ownership..."
chown -R "${OMNIDECK_USER}:${OMNIDECK_USER}" "${OMNIDECK_DIR}"

echo "==> Installing systemd service..."
cp "${SERVICE_SRC}" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

echo "==> Installation complete."
echo "    Service status:"
systemctl status "${SERVICE_NAME}" --no-pager || true

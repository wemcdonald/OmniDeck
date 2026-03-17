#!/usr/bin/env bash
set -euo pipefail

# Initial Raspberry Pi setup for OmniDeck Hub.
# Installs Node 22, pnpm, udev rules, and creates required directories.
# Run as root (or via sudo) on a fresh Raspberry Pi OS installation.

OMNIDECK_USER="${OMNIDECK_USER:-pi}"
OMNIDECK_DIR="/opt/omnideck"
CONFIG_DIR="/home/${OMNIDECK_USER}/.omnideck"
UDEV_RULES_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/deploy/udev/50-stream-deck.rules"

echo "==> Installing Node.js 22 via NodeSource..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo "==> Installing pnpm..."
npm install -g pnpm

echo "==> Installing udev rules for Stream Deck USB access..."
cp "${UDEV_RULES_SRC}" /etc/udev/rules.d/50-stream-deck.rules
udevadm control --reload-rules
udevadm trigger

echo "==> Creating OmniDeck directories..."
mkdir -p "${OMNIDECK_DIR}"
mkdir -p "${CONFIG_DIR}/config"
chown -R "${OMNIDECK_USER}:${OMNIDECK_USER}" "${OMNIDECK_DIR}"
chown -R "${OMNIDECK_USER}:${OMNIDECK_USER}" "${CONFIG_DIR}"

echo "==> Adding ${OMNIDECK_USER} to plugdev group for USB access..."
usermod -aG plugdev "${OMNIDECK_USER}"

echo "==> Pi setup complete."
echo "    Next: run scripts/install.sh to deploy the hub."

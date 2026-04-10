#!/usr/bin/env bash
# =============================================================================
# OmniDeck Hub — Fresh Install Script
# =============================================================================
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/wemcdonald/OmniDeck/master/deploy/install.sh | bash
#
#   Or with upgrade flag to pull latest code on an existing install:
#   curl -fsSL .../install.sh | bash -s -- --upgrade
#
# What this script does:
#   1. Verifies a Debian-based OS (Raspberry Pi OS, Debian, Ubuntu)
#   2. Ensures Node.js 22+ is installed (installs via NodeSource if needed)
#   3. Installs pnpm via corepack
#   4. Installs system dependencies (fontconfig)
#   5. Clones or updates OmniDeck into /opt/omnideck
#   6. Installs npm dependencies and builds the hub
#   7. Installs udev rules for Stream Deck HID access
#   8. Adds the current user to the plugdev group
#   9. Creates ~/.omnideck config directory with a starter config.yaml
#  10. Generates and installs a systemd service for the current user
#  11. Enables and starts the service
#
# Requirements:
#   - Debian-based Linux (Raspberry Pi OS, Debian, Ubuntu)
#   - sudo privileges
#   - Internet access
# =============================================================================

set -e

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PREFIX="[OmniDeck]"
INSTALL_DIR="/opt/omnideck"
REPO_URL="https://github.com/wemcdonald/OmniDeck.git"
SERVICE_NAME="omnideck-hub"
SERVICE_DEST="/etc/systemd/system/${SERVICE_NAME}.service"
UDEV_DEST="/etc/udev/rules.d/50-omnideck.rules"
HUB_PORT=28120

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------
UPGRADE=0
for arg in "$@"; do
  case "$arg" in
    --upgrade) UPGRADE=1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { echo "${PREFIX} $*"; }
warn()  { echo "${PREFIX} WARNING: $*" >&2; }
die()   { echo "${PREFIX} ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Step 1: Detect OS
# ---------------------------------------------------------------------------
info "Checking operating system..."

if [ ! -f /etc/os-release ]; then
  die "/etc/os-release not found. Cannot determine OS. Only Debian-based systems are supported."
fi

# shellcheck source=/dev/null
. /etc/os-release

IS_DEBIAN_BASED=0
if [ "${ID:-}" = "debian" ] || [ "${ID:-}" = "ubuntu" ] || [ "${ID:-}" = "raspbian" ]; then
  IS_DEBIAN_BASED=1
fi
if [ "${ID_LIKE:-}" = "debian" ] || echo "${ID_LIKE:-}" | grep -q "debian"; then
  IS_DEBIAN_BASED=1
fi

if [ "$IS_DEBIAN_BASED" -eq 0 ]; then
  die "Unsupported OS: ${PRETTY_NAME:-${ID:-unknown}}. OmniDeck Hub requires a Debian-based system (Raspberry Pi OS, Debian, Ubuntu)."
fi

info "OS detected: ${PRETTY_NAME:-${ID:-unknown}} — OK"

# ---------------------------------------------------------------------------
# Step 2: Check / install Node.js 22+
# ---------------------------------------------------------------------------
info "Checking Node.js version..."

NODE_OK=0
if command -v node >/dev/null 2>&1; then
  NODE_VERSION_FULL="$(node --version)"           # e.g. v22.1.0
  NODE_MAJOR="${NODE_VERSION_FULL#v}"             # strip leading v
  NODE_MAJOR="${NODE_MAJOR%%.*}"                  # keep major only
  if [ "$NODE_MAJOR" -ge 22 ] 2>/dev/null; then
    NODE_OK=1
    info "Node.js ${NODE_VERSION_FULL} found — OK"
  else
    warn "Node.js ${NODE_VERSION_FULL} is installed but version 22+ is required."
  fi
fi

if [ "$NODE_OK" -eq 0 ]; then
  info "Installing Node.js 22 from NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  info "Node.js $(node --version) installed."
fi

# ---------------------------------------------------------------------------
# Step 3: Install pnpm via corepack
# ---------------------------------------------------------------------------
info "Setting up pnpm via corepack..."

sudo corepack enable
corepack prepare pnpm@latest --activate

info "pnpm $(pnpm --version) ready."

# ---------------------------------------------------------------------------
# Step 4: Install system dependencies
# ---------------------------------------------------------------------------
info "Installing system dependencies..."

sudo apt-get install -y git fontconfig

# ---------------------------------------------------------------------------
# Step 5: Clone or update OmniDeck
# ---------------------------------------------------------------------------
if [ ! -d "$INSTALL_DIR" ]; then
  info "Cloning OmniDeck into ${INSTALL_DIR}..."
  sudo git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  sudo chown -R "$USER":"$USER" "$INSTALL_DIR"
elif [ "$UPGRADE" -eq 1 ]; then
  info "Upgrading OmniDeck in ${INSTALL_DIR}..."
  git -C "$INSTALL_DIR" pull
else
  info "OmniDeck already installed at ${INSTALL_DIR}. Pass --upgrade to update."
fi

# ---------------------------------------------------------------------------
# Step 6: Install dependencies
# ---------------------------------------------------------------------------
info "Installing Node.js dependencies..."
(cd "$INSTALL_DIR" && pnpm install --frozen-lockfile)

# ---------------------------------------------------------------------------
# Step 7: Build hub
# ---------------------------------------------------------------------------
info "Building OmniDeck Hub..."
(cd "$INSTALL_DIR" && pnpm --filter hub build)

# ---------------------------------------------------------------------------
# Step 8: Set up udev rules
# ---------------------------------------------------------------------------
info "Installing udev rules for Stream Deck HID access..."

UDEV_SRC="${INSTALL_DIR}/deploy/udev/50-omnideck.rules"
if [ ! -f "$UDEV_SRC" ]; then
  die "udev rules source not found at ${UDEV_SRC}"
fi

if [ ! -f "$UDEV_DEST" ]; then
  sudo cp "$UDEV_SRC" "$UDEV_DEST"
  info "udev rules installed to ${UDEV_DEST}."
else
  info "udev rules already present at ${UDEV_DEST} — skipping copy."
fi

sudo udevadm control --reload-rules
sudo udevadm trigger
info "udev rules reloaded."

# ---------------------------------------------------------------------------
# Step 9: Add user to plugdev group
# ---------------------------------------------------------------------------
info "Adding ${USER} to the plugdev group..."
sudo usermod -aG plugdev "$USER"
info "Done. You may need to log out and back in for this to take effect."

# ---------------------------------------------------------------------------
# Step 10: Create config directory and starter config
# ---------------------------------------------------------------------------
CONFIG_DIR="${HOME}/.omnideck/config"
PAGES_DIR="${CONFIG_DIR}/pages"
CONFIG_FILE="${CONFIG_DIR}/config.yaml"

info "Setting up config directory at ${CONFIG_DIR}..."
mkdir -p "$PAGES_DIR"

if [ ! -f "$CONFIG_FILE" ]; then
  info "Writing starter config.yaml..."
  cat > "$CONFIG_FILE" <<'YAML'
# OmniDeck Hub Configuration
# See https://github.com/wemcdonald/OmniDeck for full documentation.

hub:
  port: 28120

# Add your Stream Deck devices and pages here.
# devices: []
YAML
  info "Starter config written to ${CONFIG_FILE}."
else
  info "Config file already exists at ${CONFIG_FILE} — skipping."
fi

# ---------------------------------------------------------------------------
# Step 11: Generate and install systemd service
# ---------------------------------------------------------------------------
info "Installing systemd service..."

SERVICE_TEMPLATE="${INSTALL_DIR}/deploy/omnideck-hub.service"
if [ ! -f "$SERVICE_TEMPLATE" ]; then
  die "Service template not found at ${SERVICE_TEMPLATE}"
fi

GENERATED_SERVICE="$(mktemp /tmp/omnideck-hub.service.XXXXXX)"
sed \
  -e "s|%%USER%%|${USER}|g" \
  -e "s|%%HOME%%|${HOME}|g" \
  -e "s|%%INSTALL_DIR%%|${INSTALL_DIR}|g" \
  "$SERVICE_TEMPLATE" > "$GENERATED_SERVICE"

sudo cp "$GENERATED_SERVICE" "$SERVICE_DEST"
rm -f "$GENERATED_SERVICE"

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

info "Service ${SERVICE_NAME} enabled and started."

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
HOSTNAME_LOCAL="$(hostname).local"

echo ""
echo "============================================================"
echo "${PREFIX} Installation complete!"
echo "============================================================"
echo ""
echo "  OmniDeck Hub is running at:"
echo "    http://${HOSTNAME_LOCAL}:${HUB_PORT}"
echo "    http://localhost:${HUB_PORT}"
echo ""
echo "  Config directory : ${CONFIG_DIR}"
echo "  Install directory: ${INSTALL_DIR}"
echo "  Service status   : sudo systemctl status ${SERVICE_NAME}"
echo "  Service logs     : journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "  IMPORTANT: If this is a fresh install, log out and back in"
echo "  (or run 'newgrp plugdev') so Stream Deck USB access takes effect."
echo "============================================================"

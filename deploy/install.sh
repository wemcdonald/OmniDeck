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

# Wi-Fi setup / AP fallback
AP_CONNECTION="omnideck-setup-ap"
AP_SSID="OmniDeck Setup"
AP_PSK="omnideck"
AP_IP="192.168.50.1/24"
FALLBACK_SERVICE_NAME="omnideck-setup-fallback"
FALLBACK_SERVICE_DEST="/etc/systemd/system/${FALLBACK_SERVICE_NAME}.service"
DNSMASQ_SHARED_DIR="/etc/NetworkManager/dnsmasq-shared.d"
DNSMASQ_SHARED_DEST="${DNSMASQ_SHARED_DIR}/omnideck-captive.conf"
SUDOERS_DEST="/etc/sudoers.d/omnideck-nmcli"

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------
UPGRADE=0
WITH_HOTSPOT=1
for arg in "$@"; do
  case "$arg" in
    --upgrade) UPGRADE=1 ;;
    --no-hotspot) WITH_HOTSPOT=0 ;;
    --with-hotspot) WITH_HOTSPOT=1 ;;
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

sudo apt-get install -y git git-lfs fontconfig
git lfs install --skip-repo

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

# Fetch LFS objects (e.g. NotoColorEmoji.ttf) that aren't included in a shallow clone
info "Fetching Git LFS assets..."
git -C "$INSTALL_DIR" lfs pull

# ---------------------------------------------------------------------------
# Step 6: Install dependencies
# ---------------------------------------------------------------------------
info "Installing Node.js dependencies..."
(cd "$INSTALL_DIR" && pnpm install --frozen-lockfile)

# ---------------------------------------------------------------------------
# Step 7: Build hub
# ---------------------------------------------------------------------------
info "Building OmniDeck Hub (frontend + backend)..."
(cd "$INSTALL_DIR" && NODE_OPTIONS="--max-old-space-size=600" pnpm --filter omnideck-hub build:all)
if [ ! -f "${INSTALL_DIR}/hub/dist/index.js" ]; then
  die "Build failed: ${INSTALL_DIR}/hub/dist/index.js not found after build step."
fi
if [ ! -f "${INSTALL_DIR}/hub/dist/web/index.html" ]; then
  die "Build failed: ${INSTALL_DIR}/hub/dist/web/index.html not found after build step."
fi

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
info "Configuring USB device permissions..."
sudo usermod -aG plugdev "$USER"
info "Done."

# ---------------------------------------------------------------------------
# Step 10: Create config directory and starter config
# ---------------------------------------------------------------------------
CONFIG_DIR="${HOME}/.omnideck/config"
PAGES_DIR="${CONFIG_DIR}/pages"
CONFIG_FILE="${CONFIG_DIR}/config.yaml"
PLUGINS_DIR="${HOME}/.omnideck/plugins"

info "Setting up config directory at ${CONFIG_DIR}..."
mkdir -p "$PAGES_DIR"
mkdir -p "$PLUGINS_DIR"

if [ ! -f "$CONFIG_FILE" ]; then
  info "Writing starter config.yaml..."
  cat > "$CONFIG_FILE" <<'YAML'
# OmniDeck Hub Configuration
# See https://github.com/wemcdonald/OmniDeck for full documentation.

hub:
  port: 28120

deck:
  brightness: 100
  wake_on_touch: true
  default_page: main

plugins:
  sound: {}

# Add your Stream Deck devices and pages here.
# devices: []
YAML
  info "Starter config written to ${CONFIG_FILE}."
else
  info "Config file already exists at ${CONFIG_FILE} — skipping."
fi

MAIN_PAGE_FILE="${PAGES_DIR}/main.yaml"
if [ ! -f "$MAIN_PAGE_FILE" ] && [ -z "$(ls -A "$PAGES_DIR" 2>/dev/null)" ]; then
  info "Writing starter main.yaml page..."
  cat > "$MAIN_PAGE_FILE" <<'YAML'
page: main
name: Main
buttons: []
YAML
  info "Starter page written to ${MAIN_PAGE_FILE}."
fi

# Seed first-party plugins on a fresh install.
# On upgrade, user-installed plugins in PLUGINS_DIR are left untouched; only
# first-party plugins that don't already exist are copied in.
BUNDLED_PLUGINS_DIR="${INSTALL_DIR}/plugins"
if [ -d "$BUNDLED_PLUGINS_DIR" ]; then
  info "Seeding first-party plugins into ${PLUGINS_DIR}..."
  for PLUGIN_SRC in "${BUNDLED_PLUGINS_DIR}"/*/; do
    [ -d "$PLUGIN_SRC" ] || continue
    PLUGIN_NAME="$(basename "$PLUGIN_SRC")"
    PLUGIN_DEST="${PLUGINS_DIR}/${PLUGIN_NAME}"
    if [ ! -d "$PLUGIN_DEST" ]; then
      cp -r "$PLUGIN_SRC" "$PLUGIN_DEST"
      info "  Installed plugin: ${PLUGIN_NAME}"
    else
      info "  Plugin already present, skipping: ${PLUGIN_NAME}"
    fi
  done
else
  warn "No bundled plugins directory found at ${BUNDLED_PLUGINS_DIR} — skipping plugin seed."
fi

# ---------------------------------------------------------------------------
# Step 11: Wi-Fi setup AP (optional)
# ---------------------------------------------------------------------------
if [ "$WITH_HOTSPOT" -eq 1 ]; then
  info "Configuring Wi-Fi setup hotspot..."

  if ! command -v nmcli >/dev/null 2>&1; then
    info "Installing NetworkManager..."
    sudo apt-get install -y network-manager
  fi

  sudo systemctl enable --now NetworkManager >/dev/null 2>&1 || \
    warn "Could not enable NetworkManager — Wi-Fi setup may not work until it is running."

  # Dnsmasq hijack so phones hit our captive portal regardless of host
  sudo mkdir -p "$DNSMASQ_SHARED_DIR"
  sudo cp "${INSTALL_DIR}/deploy/nm-dnsmasq-shared-omnideck.conf" "$DNSMASQ_SHARED_DEST"
  sudo chmod 644 "$DNSMASQ_SHARED_DEST"

  # Create (or update) the AP profile. We *define* it here; the fallback
  # service decides when to bring it up.
  if sudo nmcli -t -f NAME connection show 2>/dev/null | grep -Fxq "$AP_CONNECTION"; then
    info "AP profile '${AP_CONNECTION}' already exists — updating settings."
    sudo nmcli connection modify "$AP_CONNECTION" \
      802-11-wireless.mode ap \
      802-11-wireless.ssid "$AP_SSID" \
      802-11-wireless.band bg \
      ipv4.method shared \
      ipv4.addresses "$AP_IP" \
      ipv6.method ignore \
      wifi-sec.key-mgmt wpa-psk \
      wifi-sec.psk "$AP_PSK" \
      connection.autoconnect no \
      connection.interface-name wlan0 >/dev/null
  else
    info "Creating AP profile '${AP_CONNECTION}'..."
    sudo nmcli connection add \
      type wifi \
      ifname wlan0 \
      con-name "$AP_CONNECTION" \
      autoconnect no \
      ssid "$AP_SSID" \
      -- \
      802-11-wireless.mode ap \
      802-11-wireless.band bg \
      ipv4.method shared \
      ipv4.addresses "$AP_IP" \
      ipv6.method ignore \
      wifi-sec.key-mgmt wpa-psk \
      wifi-sec.psk "$AP_PSK" >/dev/null
  fi

  # Sudoers drop-in so the hub user can run the narrow set of nmcli commands
  # needed for scanning + connecting + toggling the AP.
  SUDOERS_TMP="$(mktemp /tmp/omnideck-nmcli.sudoers.XXXXXX)"
  sed -e "s|%%USER%%|${USER}|g" \
    "${INSTALL_DIR}/deploy/omnideck-nmcli.sudoers" > "$SUDOERS_TMP"
  if sudo visudo -cf "$SUDOERS_TMP" >/dev/null; then
    sudo install -m 0440 -o root -g root "$SUDOERS_TMP" "$SUDOERS_DEST"
    info "Installed sudoers drop-in at ${SUDOERS_DEST}"
  else
    warn "visudo rejected ${SUDOERS_TMP} — not installing. Wi-Fi setup may require manual sudo."
  fi
  rm -f "$SUDOERS_TMP"

  # Fallback supervisor service
  FALLBACK_TEMPLATE="${INSTALL_DIR}/deploy/omnideck-setup-fallback.service"
  FALLBACK_GEN="$(mktemp /tmp/omnideck-setup-fallback.service.XXXXXX)"
  sed -e "s|%%INSTALL_DIR%%|${INSTALL_DIR}|g" "$FALLBACK_TEMPLATE" > "$FALLBACK_GEN"
  sudo install -m 0644 -o root -g root "$FALLBACK_GEN" "$FALLBACK_SERVICE_DEST"
  rm -f "$FALLBACK_GEN"

  info "Wi-Fi setup AP configured. SSID='${AP_SSID}' password='${AP_PSK}' IP=${AP_IP%/*}"
else
  info "Skipping Wi-Fi setup hotspot (--no-hotspot)."
fi

# ---------------------------------------------------------------------------
# Step 12: Generate and install systemd service
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

if [ "$WITH_HOTSPOT" -eq 1 ]; then
  sudo systemctl enable "$FALLBACK_SERVICE_NAME" >/dev/null 2>&1 || true
  sudo systemctl restart "$FALLBACK_SERVICE_NAME" >/dev/null 2>&1 || true
fi

# Give the service a moment to start, then check it's actually running
sleep 2
if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
  info "Service ${SERVICE_NAME} is running."
else
  warn "Service ${SERVICE_NAME} may not have started cleanly."
  warn "Check logs with: journalctl -u ${SERVICE_NAME} -n 50"
fi

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
if [ "$WITH_HOTSPOT" -eq 1 ]; then
  echo ""
  echo "  Setup hotspot    : SSID='${AP_SSID}' password='${AP_PSK}'"
  echo "                     (broadcasts automatically if Wi-Fi fails)"
  echo "  Setup URL        : http://${AP_IP%/*}/setup"
  echo "  Fallback logs    : journalctl -u ${FALLBACK_SERVICE_NAME} -f"
fi
echo "============================================================"

#!/usr/bin/env bash
# =============================================================================
# OmniDeck Wi-Fi fallback supervisor
# =============================================================================
#
# Runs as root under systemd (omnideck-setup-fallback.service).
#
# Loop:
#   - If NetworkManager reports FULL connectivity and setup AP is NOT active,
#     do nothing.
#   - If NetworkManager reports no full connectivity, but we have saved Wi-Fi
#     credentials that NM is still trying, wait out the grace window.
#   - Otherwise activate the omnideck-setup-ap profile so the user can onboard.
#   - If a client connection becomes active while the AP is up, tear the AP
#     down (the AP uses wlan0 and must yield).
#
# Deliberately kept small and deterministic. No state files, no retries beyond
# the loop cadence.
# =============================================================================
set -u

AP_CONNECTION="omnideck-setup-ap"
WLAN_IFACE="${OMNIDECK_WLAN_IFACE:-wlan0}"
BOOT_GRACE_SECONDS="${OMNIDECK_BOOT_GRACE_SECONDS:-30}"
CHECK_INTERVAL_SECONDS="${OMNIDECK_CHECK_INTERVAL_SECONDS:-15}"

log() { echo "[omnideck-wifi-fallback] $*" >&2; }

ap_active() {
  nmcli -t -f NAME connection show --active 2>/dev/null | grep -Fxq "$AP_CONNECTION"
}

client_active() {
  # Any active wifi connection other than our AP on wlan0
  local line name type device
  while IFS=: read -r name type device _; do
    [ "$type" = "802-11-wireless" ] || continue
    [ "$name" = "$AP_CONNECTION" ] && continue
    [ "$device" = "$WLAN_IFACE" ] || continue
    return 0
  done < <(nmcli -t -f NAME,TYPE,DEVICE,STATE connection show --active 2>/dev/null)
  return 1
}

has_full_connectivity() {
  local state
  state="$(nmcli -t -f CONNECTIVITY general 2>/dev/null)"
  [ "$state" = "full" ]
}

has_saved_wifi() {
  # Any stored wifi profile other than the AP
  local name type
  while IFS=: read -r name type; do
    [ "$type" = "802-11-wireless" ] || continue
    [ "$name" = "$AP_CONNECTION" ] && continue
    return 0
  done < <(nmcli -t -f NAME,TYPE connection show 2>/dev/null)
  return 1
}

ap_up() {
  ap_active && return 0
  log "bringing up $AP_CONNECTION"
  nmcli connection up "$AP_CONNECTION" >/dev/null 2>&1
}

ap_down() {
  ap_active || return 0
  log "tearing down $AP_CONNECTION"
  nmcli connection down "$AP_CONNECTION" >/dev/null 2>&1
}

log "starting (iface=$WLAN_IFACE, grace=${BOOT_GRACE_SECONDS}s)"

# Boot grace: give NM a chance to auto-connect saved networks before we
# interrupt wlan0 with the AP.
GRACE_DEADLINE=$(( $(date +%s) + BOOT_GRACE_SECONDS ))
while [ "$(date +%s)" -lt "$GRACE_DEADLINE" ]; do
  if client_active && has_full_connectivity; then
    log "client connected during grace — skipping AP"
    break
  fi
  sleep 2
done

while true; do
  if client_active && has_full_connectivity; then
    ap_down
  elif client_active && ! has_full_connectivity; then
    # Connected but no internet — still prefer client over AP, user may be
    # on a LAN without upstream. Don't thrash.
    ap_down
  else
    if ! has_saved_wifi; then
      ap_up
    else
      # We have saved creds but no client link — NM is probably retrying.
      # Bring AP up so the user can fix creds without waiting forever.
      ap_up
    fi
  fi
  sleep "$CHECK_INTERVAL_SECONDS"
done

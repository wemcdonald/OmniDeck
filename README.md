<p align="center">
  <img src="docs/logo.svg" width="128" height="128" alt="OmniDeck">
</p>

# OmniDeck

A self-hosted Stream Deck controller that turns your hardware deck into a multi-computer command center. One deck, one hub (Raspberry Pi), multiple computers.

**Key features:**
- Control multiple computers from one deck — buttons automatically follow keyboard focus or active app
- Plugin system for Spotify, Discord, Slack, Home Assistant, weather, and more
- Live state on buttons (album art, playback position, HA entity state, unread counts)
- Web UI for configuration — no config files to edit

## How it works

```mermaid
graph LR
    SD[Stream Deck<br/>USB]
    Hub[Hub<br/>Raspberry Pi]
    Mac[Mac Agent]
    PC[Windows Agent]
    HA[Home Assistant]
    Spotify[Spotify<br/>via Mac agent]
    Weather[Weather API]

    SD <-->|HID| Hub
    Hub <-->|WebSocket| Mac
    Hub <-->|WebSocket| PC
    Hub <-->|WebSocket| HA
    Mac --- Spotify
    Hub --- Weather
    Hub <-->|Browser| ConfigUI[Web UI :28120]
```

The **hub** runs on a Raspberry Pi, manages the Stream Deck hardware, loads plugins, and serves the configuration UI. **Agents** run on your Mac/PC and receive commands from the hub — keystrokes, mouse clicks, and app control stay on the machine that needs them. Cloud plugins (Weather) run entirely on the hub. Hybrid plugins (Spotify) run their API calls on the agent but send state back to the hub for button rendering.

![OmniDeck page editor showing a populated deck grid alongside the plugin browser panel](docs/screenshots/hero.png)

## Quick start

1. Install the hub on a Raspberry Pi:
   ```bash
   curl -sSf https://raw.githubusercontent.com/wemcdonald/OmniDeck/master/deploy/install.sh | bash
   ```
2. Open `http://<pi-hostname>.local:28120` in your browser
3. Install the agent on your Mac/PC from the Agents page
4. Install plugins from the Plugins page

→ [Full install guide](docs/getting-started.md) · [Documentation](docs/) · [Plugin guide](docs/plugin-guide.md)

## Wi-Fi setup mode

If the Pi cannot join a known Wi-Fi network within ~30 seconds of boot, it broadcasts its own onboarding hotspot:

- SSID: **OmniDeck Setup**
- Password: **omnideck**
- Setup page: any URL in your browser (iOS/Android will pop the captive-portal UI automatically), or `http://192.168.50.1/setup`

From the setup page, pick a nearby network, enter its password, and the Pi will join it and drop the hotspot. Credentials are saved via NetworkManager, so the next reboot connects normally. If the saved network disappears later, the hotspot returns automatically.

To skip hotspot setup on a fresh install (e.g. headless Ethernet-only deployments):

```bash
curl -sSf .../install.sh | bash -s -- --no-hotspot
```

**Troubleshooting**

- `journalctl -u omnideck-setup-fallback -f` — fallback supervisor decisions
- `nmcli -t -f NAME,TYPE,DEVICE connection show --active` — what is using wlan0 right now
- `sudo nmcli connection up omnideck-setup-ap` — force hotspot on for debugging
- `sudo nmcli connection down omnideck-setup-ap` — drop hotspot (NM will retry saved Wi-Fi)
- `sudo nmcli connection delete "<network-name>"` — forget a stored Wi-Fi network

**Recovery**

To wipe all stored Wi-Fi networks and return to setup mode on next boot:

```bash
sudo nmcli -t -f NAME,TYPE connection show \
  | awk -F: '$2 == "802-11-wireless" && $1 != "omnideck-setup-ap" { print $1 }' \
  | xargs -r -I{} sudo nmcli connection delete "{}"
sudo reboot
```

## Plugins

The [OmniDeck-plugins](https://github.com/wemcdonald/OmniDeck-plugins) repository contains the full plugin library — Spotify, Discord, Slack, Google Meet, Zoom, Weather, Clock, and more. Plugins are installed directly from the web UI; no manual file copying needed.

→ [Install plugins](docs/plugin-install.md) · [Write a plugin](docs/plugin-guide.md)

## Hardware

Want to 3D-print a case that mounts the Raspberry Pi directly behind your Stream Deck? See [OmniDeck-hardware](https://github.com/wemcdonald/OmniDeck-hardware).

## Development

```bash
pnpm install
pnpm --filter hub dev      # hub + web UI (localhost:28120)
pnpm --filter agent dev    # agent (connects to hub)
```

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full technical deep-dive.

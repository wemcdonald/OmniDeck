# OmniDeck

**One Stream Deck. Every computer. Every service. One Pi.**

OmniDeck turns a Raspberry Pi into the brain of your Stream Deck, giving it the ability to control multiple computers, Home Assistant, Spotify, and anything else with a plugin — all from a single device sitting on your desk.

<!-- TODO: Screenshot — physical Stream Deck on a desk showing a mix of HA light buttons, volume controls, and media info. Capture with lights on so the button art is visible. -->

## The Problem

Elgato's Stream Deck software only controls the machine it's plugged into. If you have a Mac and a PC (or a home lab, or a media server), you need separate decks or constant USB switching. And if you want buttons that show live Home Assistant state, Spotify now-playing, or Discord voice status — you're out of luck entirely.

**Bitfocus Companion** solves some of this, but it's built for broadcast/AV workflows. It doesn't understand multi-computer focus switching, doesn't have first-class Home Assistant integration, and its module system carries the weight of hundreds of broadcast protocols most people will never use.

## What OmniDeck Does

A Node.js hub runs on a Raspberry Pi connected to your Stream Deck via USB. Lightweight agents run on your Mac/PC. Plugins handle everything else.

```
Stream Deck <--USB--> Raspberry Pi Hub <--WebSocket--> Mac Agent
                          |                        \-> Windows Agent
                          |--WebSocket--> Home Assistant
                          |--HTTP-------> Spotify API
                          \--Web UI-----> Browser (config + live preview)
```

- **Multi-computer control**: Launch apps, send keystrokes, adjust volume on any machine. The deck follows your focus automatically.
- **Home Assistant**: Live entity state on buttons — lights, sensors, climate, locks, media players. Toggle anything with a tap.
- **Plugin system**: Every integration is a plugin. First-party plugins for HA, Spotify, Sound, and OS control ship built-in. Write your own with Zod schemas for type-safe params and a rich config UI for free.
- **Web config UI**: Stream Deck-style drag-and-drop editor. Browse plugins, pick presets, configure params with entity pickers and color pickers — no YAML required (but YAML works too).
- **Live state rendering**: Buttons update in real-time. Turn on a light in HA and the button turns yellow within 100ms.

<!-- TODO: Screenshot — web UI showing the PageEditor with deck grid on the left, plugin browser on the right, and config editor open at the bottom with a Light preset selected and entity picker visible. -->

## Quick Start

### Requirements

- Raspberry Pi 4/5 (or any Linux machine with USB)
- Elgato Stream Deck (any model)
- Node.js 22+
- pnpm 9+

### Install

```bash
git clone https://github.com/wemcdonald/OmniDeck.git
cd OmniDeck
pnpm install

# System dependency for button rendering
sudo apt install fontconfig

# Set up Stream Deck udev rules (required for non-root USB access)
sudo cp deploy/udev/50-stream-deck.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
```

### Configure

```bash
mkdir -p ~/.omnideck/config/pages
```

Create `~/.omnideck/config/config.yaml`:

```yaml
deck:
  brightness: 100
  default_page: main

plugins:
  home-assistant:
    url: ws://homeassistant.local:8123/api/websocket
    token: !secret ha_token
```

Create `~/.omnideck/secrets.yaml`:

```yaml
ha_token: "your-long-lived-access-token"
```

Create `~/.omnideck/config/pages/main.yaml`:

```yaml
page: main
name: Main
buttons:
  - pos: [0, 0]
    preset: home-assistant.light
    params:
      entity_id: light.living_room
    label: Living Room

  - pos: [1, 0]
    preset: home-assistant.toggle
    params:
      entity_id: switch.desk_fan
    label: Fan

  - pos: [2, 0]
    preset: home-assistant.sensor
    params:
      entity_id: sensor.temperature
```

### Run

```bash
cd hub
pnpm dev        # Hub (auto-reloads on code changes)
pnpm dev:web    # Web UI at http://localhost:5173 (in a second terminal)
```

<!-- TODO: Screenshot — terminal showing hub startup with "Config loaded", "HA connected", "Web server started" log lines, and the Stream Deck showing rendered buttons. -->

## Button Rendering

Buttons are rendered server-side as images using `sharp`. Each button composites layers: background color, icon (from [Material Symbols](https://fonts.google.com/icons)), label text, top label, progress bars, and badges.

State providers drive dynamic visuals — a light button shows a yellow lightbulb when on and a grey one when off. A climate button shows the current temperature and changes icon based on HVAC mode. Only buttons whose state actually changed get re-rendered.

<!-- TODO: Side-by-side image — a few rendered button PNGs showing: light on (yellow bulb), light off (grey bulb), temperature sensor, volume with progress bar. -->

## Plugin System

All integrations are plugins. A plugin can provide **Actions** (things buttons trigger), **State Providers** (live data for display), and **Presets** (pre-packaged button configs).

```
plugins/my-plugin/
  manifest.yaml     # Metadata
  hub.ts            # Hub-side logic
  agent.ts          # Optional agent-side logic (for OS-level commands)
```

Plugins define their param schemas with Zod. The web UI automatically generates the right form fields — entity pickers for HA entities, color pickers for colors, dropdowns for enums.

### Built-in Plugins

| Plugin | Actions | State | What it does |
|--------|---------|-------|-------------|
| **Home Assistant** | Toggle, turn on/off, scenes, scripts, climate, covers, locks, media, fans | Entity state with domain-specific icons and template variables | Full bidirectional HA integration via WebSocket |
| **Sound** | Volume up/down, mute/unmute, change audio device | Volume level, mute state, mic state | Control audio on any connected machine |
| **Spotify** | Play/pause, skip, volume, transfer playback, shuffle, repeat | Now playing (track + album art), playback state, device list | Spotify Web API with OAuth token management |
| **OS Control** | Launch/focus apps, send keystrokes, set volume, sleep, lock | Active window, volume level, app running | Route commands to Mac/Windows agents |
| **Core** | Change page, go back, set brightness, sleep deck, multi-action, if-then-else | Page indicator | Deck management and action composition |

### Template Variables

State providers expose Mustache template variables that you can use in labels:

```yaml
- pos: [0, 0]
  preset: home-assistant.light
  params:
    entity_id: light.office
  label: "{{brightness_percent}}%"
  top_label: "{{device_name}}"
```

## Web Configuration UI

The browser-based editor works like the Elgato Stream Deck app:

1. **Browse** plugins in the sidebar — presets, actions, and state providers organized by plugin
2. **Drag** a preset onto a button in the deck grid (or tap to assign on touch devices)
3. **Configure** params with schema-driven form fields — entity pickers, color pickers, dropdowns
4. **Customize** appearance — icon, label with template variable autocomplete, colors, background

<!-- TODO: Screenshot — close-up of the plugin browser sidebar showing Home Assistant expanded with presets like Light, Toggle, Scene, Climate, Sensor. -->

<!-- TODO: Screenshot — the button config editor showing a Light preset with entity picker dropdown open, showing HA entities with their current states. -->

## Configuration

OmniDeck uses YAML for all configuration, with a `!secret` tag for sensitive values (same pattern as Home Assistant).

```
~/.omnideck/
  config/
    config.yaml         # Deck settings, plugin configs
    pages/
      main.yaml         # Button layouts
      media.yaml
  secrets.yaml          # API tokens (gitignored)
```

The hub watches config files and hot-reloads on changes — no restart needed.

## Architecture

```
Raspberry Pi
  OmniDeck Hub (Node.js)
    Stream Deck HID ---- USB ----> Physical Stream Deck
    Plugin Host
      Home Assistant --- WebSocket --> HA instance
      Spotify ---------- HTTP ------> Spotify API
      Sound/OS Control - WebSocket --> Mac/Windows Agents
    Button Renderer (sharp)
    Web Server --------- HTTP ------> Browser Config UI
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full specification.

## Development

```bash
# Hub
cd hub
pnpm dev              # Start hub with hot-reload
pnpm test             # Run tests (vitest)
pnpm lint             # Type-check

# Web UI
cd hub/web
pnpm dev              # Vite dev server at :5173

# Plugin schema package
cd packages/plugin-schema
pnpm test
```

## Status

OmniDeck is under active development. The core loop works — Stream Deck HID, button rendering, plugin system, Home Assistant integration, web config UI, and live state updates are all functional. Agent distribution, Spotify polling, Discord integration, and the orchestration engine (focus tracking, media routing) are in progress.

## License

MIT

# Configuration Reference

OmniDeck stores configuration in `~/.omnideck/config/config.yaml`. The hub watches this file and hot-reloads on changes — no restart needed for most settings.

Sensitive values (API tokens, passwords) go in `~/.omnideck/secrets.yaml` and are referenced with `!secret <key>`. See [secrets.md](secrets.md) for details.

## Full example

```yaml
# ~/.omnideck/config/config.yaml

# ── Deck hardware ────────────────────────────────────────────
deck:
  # Button brightness (0-100). Default: 70
  brightness: 70

  # Wake the deck on touch when it has gone to sleep. Default: true
  wake_on_touch: true

  # Page to show on startup. Must match a filename in pages/.
  default_page: main

# ── Plugins ──────────────────────────────────────────────────
# Each key is a plugin ID. Values are plugin-specific config.
# Use !secret to reference values from secrets.yaml.
plugins:
  home-assistant:
    url: ws://homeassistant.local:8123/api/websocket
    token: !secret ha_token

  spotify:
    client_id: !secret spotify_client_id
    client_secret: !secret spotify_client_secret

  weather:
    api_key: !secret weather_api_key
    city: "San Francisco"
    units: imperial      # or metric

  slack:
    token: !secret slack_token

  discord:
    # No config needed — the agent handles OAuth locally

# ── Orchestrator ─────────────────────────────────────────────
orchestrator:
  # Preferred agent order for fallback routing.
  # If no agent is focused and no plugin is active, actions
  # go to the first agent in this list that is connected.
  agent_order:
    - mac-studio
    - windows-pc

  # Per-plugin routing overrides.
  # Use this to pin a plugin to a specific agent instead of
  # relying on automatic active detection.
  plugin_overrides:
    discord:
      agent: mac-studio

# ── Logging ──────────────────────────────────────────────────
logging:
  # Global log level: debug | info | warn | error. Default: info
  level: info

  # Optional log file path. Logs are always written to stdout.
  # file: /var/log/omnideck.log

  # Per-plugin log level overrides.
  plugins:
    home-assistant: debug
    weather: warn
```

## deck

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `brightness` | number (0–100) | `70` | Button LED brightness |
| `wake_on_touch` | boolean | `true` | Wake from sleep on button press |
| `default_page` | string | `main` | Page shown at startup (must match a page filename) |

## plugins

Each plugin has its own config schema — see the plugin's config card in the web UI or the plugin's own documentation for field details. All plugins support `!secret` for any string field.

The key must match the plugin's `id` from its manifest. For example, the Home Assistant plugin has `id: home-assistant`, so the config key is `home-assistant`.

## orchestrator

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `agent_order` | string[] | `[]` | Agent IDs in fallback priority order |
| `plugin_overrides` | object | `{}` | Per-plugin agent routing overrides |

`agent_order` contains the agent IDs as they appear in the Agents page. The first connected agent in the list receives fallback actions.

`plugin_overrides` maps plugin IDs to an object with an `agent` key. Use this to pin a plugin to a specific machine regardless of focus or active state.

## logging

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `level` | string | `info` | Global log level (`debug`, `info`, `warn`, `error`) |
| `file` | string | — | Optional file path to write logs |
| `plugins` | object | `{}` | Per-plugin level overrides (same level values) |

Per-plugin overrides apply only to log output from that plugin's `ctx.log.*` calls. Hub-level logs (startup, WebSocket connections, config loading) are not affected.

## Pages

Button layouts live in separate files under `~/.omnideck/config/pages/`. Each file defines one page:

```yaml
# ~/.omnideck/config/pages/main.yaml
page: main
name: Main

buttons:
  - pos: [0, 0]          # [column, row], zero-indexed
    preset: home-assistant.light
    params:
      entity_id: light.living_room
    label: Living Room

  - pos: [1, 0]
    preset: spotify.now-playing

  - pos: [2, 0]
    action: core.change-page
    params:
      page: media
    label: Media
    icon: ms:queue-music
```

The `pos` array is `[column, row]`. For a standard 5×3 Stream Deck MK.2, columns are 0–4 and rows are 0–2.

Either `preset` or `action` is required for a button. `preset` sets up both the action and state provider in one step. `action` gives you manual control over which action to use.

| Button key | Type | Description |
|-----------|------|-------------|
| `pos` | [col, row] | Button position, zero-indexed |
| `preset` | string | `pluginId.presetId` — sets action + state provider |
| `action` | string | `pluginId.actionId` — explicit action (use with or without a state provider) |
| `state` | string | `pluginId.stateProviderId` — explicit state provider |
| `params` | object | Action and state provider parameters |
| `label` | string | Bottom label. Supports `{{template}}` variables from state. |
| `top_label` | string | Top label. Supports `{{template}}` variables. |
| `icon` | string | Icon name (e.g., `ms:lightbulb`). Overrides preset default. |
| `background` | string | Background color (hex) or `"none"`. |
| `text_color` | string | Label text color (hex). Default: white. |

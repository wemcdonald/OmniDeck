# Home Assistant Plugin

Full bidirectional integration with Home Assistant. Control lights, switches, scenes, climate, covers, locks, fans, and media players from your deck — and publish OmniDeck state back to HA for use in automations.

Connects via the HA WebSocket API with real-time entity state subscriptions (no polling). Auto-reconnects with exponential backoff.

**Plugin ID:** `home-assistant`

## Configuration

```yaml
plugins:
  home-assistant:
    url: ws://homeassistant.local:8123/api/websocket
    token: !secret ha_token
    reconnect: true  # optional, default: true
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `url` | string | **required** | HA WebSocket URL |
| `token` | string | **required** | Long-lived access token ([how to create one](https://www.home-assistant.io/docs/authentication/#your-account-profile)) |
| `reconnect` | boolean | `true` | Auto-reconnect on disconnect (1s backoff, doubles to 60s max) |
| `publish` | object | disabled | State publishing config (see [Publishing State to HA](#publishing-state-to-ha)) |

## Quick Start

Most common use cases are one-liners with presets:

```yaml
buttons:
  # Toggle a light with live brightness + color feedback
  - pos: [0, 0]
    preset: home-assistant.light
    params: { entity_id: light.office_desk }
    label: Desk

  # Activate a scene
  - pos: [1, 0]
    preset: home-assistant.scene
    params: { scene_id: scene.movie_night }
    label: Movie
    icon: ms:movie

  # Thermostat with live temperature display
  - pos: [2, 0]
    preset: home-assistant.climate
    params: { entity_id: climate.living_room }

  # Read-only temperature sensor
  - pos: [3, 0]
    preset: home-assistant.sensor
    params: { entity_id: sensor.outdoor_temperature }

  # Toggle any switch/fan/input_boolean
  - pos: [0, 1]
    preset: home-assistant.toggle
    params: { entity_id: switch.desk_fan }
    label: Fan
    icon: ms:mode-fan

  # Lock with state feedback
  - pos: [1, 1]
    preset: home-assistant.lock
    params: { entity_id: lock.front_door }

  # Media player play/pause
  - pos: [2, 1]
    preset: home-assistant.media_player
    params: { entity_id: media_player.living_room_tv }

  # Cover (blinds/garage)
  - pos: [3, 1]
    preset: home-assistant.cover
    params: { entity_id: cover.garage_door }
```

## Actions

### Entity control

| Action | Params | Description |
|--------|--------|-------------|
| `home-assistant.toggle` | `entity_id` | Toggle any toggleable entity |
| `home-assistant.turn_on` | `entity_id`, + service data (e.g. `brightness`, `color_name`) | Turn on with optional attributes |
| `home-assistant.turn_off` | `entity_id` | Turn off |

### Scenes and scripts

| Action | Params | Description |
|--------|--------|-------------|
| `home-assistant.run_scene` | `scene_id` | Activate a scene. Accepts `scene.xxx` or just `xxx`. |
| `home-assistant.run_script` | `script_id`, `variables` (optional) | Run a script with optional variables |

### Climate

| Action | Params | Description |
|--------|--------|-------------|
| `home-assistant.set_climate` | `entity_id`, `temperature`, `hvac_mode`, `target_temp_high`, `target_temp_low` | Set thermostat temperature and/or mode |

### Covers

| Action | Params | Description |
|--------|--------|-------------|
| `home-assistant.set_cover` | `entity_id`, `position` (0-100) or `command` ("open"/"close"/"stop") | Control a cover. Defaults to toggle if neither position nor command given. |

### Locks

| Action | Params | Description |
|--------|--------|-------------|
| `home-assistant.lock` | `entity_id` | Lock |
| `home-assistant.unlock` | `entity_id` | Unlock |
| `home-assistant.toggle_lock` | `entity_id`, `current_state` (optional) | Toggle based on current state |

### Media player

| Action | Params | Description |
|--------|--------|-------------|
| `home-assistant.media_play_pause` | `entity_id` | Play/pause |
| `home-assistant.media_next` | `entity_id` | Next track |
| `home-assistant.media_volume_set` | `entity_id`, `volume_level` (0.0-1.0) | Set volume |

### Fan

| Action | Params | Description |
|--------|--------|-------------|
| `home-assistant.set_fan_speed` | `entity_id`, `percentage` (0-100) | Set fan speed |

### Generic

| Action | Params | Description |
|--------|--------|-------------|
| `home-assistant.call_service` | `domain`, `service`, `data`, `entity_id` | Call any HA service directly |
| `home-assistant.fire_event` | `event_type`, `event_data` | Fire an event on the HA event bus |
| `home-assistant.set_input` | `entity_id`, `value` | Set an input helper (input_boolean, input_number, input_select, input_text, input_datetime) |

## State Providers

All state providers accept `{ entity_id: "domain.name" }` and update in real-time via WebSocket.

### `home-assistant.entity_state`

Generic provider that works with any entity domain. Automatically picks icon, background color, and label based on the domain (light, switch, fan, lock, sensor, etc.). Shows friendly name as top label.

### `home-assistant.light_state`

Light-specific: shows brightness as a progress bar, brightness percentage as label. Background matches the light's RGB color when available. Dims when off.

### `home-assistant.climate_state`

Shows current temperature as label, target temperature as top label. Background color reflects hvac action: orange when heating, blue when cooling, gray when idle.

### `home-assistant.media_player_state`

Shows media title as label, app name as top label. Play/pause icon reflects playback state. Dims when off/unavailable.

### `home-assistant.sensor_value`

Shows sensor value with unit. Icon adapts to `device_class` (thermometer for temperature, water-drop for humidity, battery, flash for power, etc.). Battery sensors get a progress bar and red badge when low.

### `home-assistant.cover_state`

Shows cover position as progress bar. Icon adapts: garage icons for `device_class: garage`, blinds for others. Dims when closed.

### `home-assistant.lock_state`

Shows locked (red, lock icon) or unlocked (green, lock-open icon) state.

### `home-assistant.fan_state`

Shows fan speed percentage as progress bar and label. Dims when off.

## Presets

Presets wire up the right action + state provider + icon in one line.

| Preset | Action | State Provider | Default Icon |
|--------|--------|----------------|--------------|
| `home-assistant.light` | `toggle` | `light_state` | `ms:lightbulb` |
| `home-assistant.toggle` | `toggle` | `entity_state` | (domain-inferred) |
| `home-assistant.scene` | `run_scene` | — | `ms:palette` |
| `home-assistant.script` | `run_script` | — | `ms:description` |
| `home-assistant.climate` | `set_climate` | `climate_state` | `ms:thermostat` |
| `home-assistant.cover` | `set_cover` | `cover_state` | `ms:blinds` |
| `home-assistant.sensor` | — (read-only) | `sensor_value` | `ms:show-chart` |
| `home-assistant.lock` | `toggle_lock` | `lock_state` | `ms:lock` |
| `home-assistant.fan` | `toggle` | `fan_state` | `ms:mode-fan` |
| `home-assistant.media_player` | `media_play_pause` | `media_player_state` | `ms:play-circle` |

Legacy aliases are also available: `light_toggle`, `switch_toggle`, `scene_activate`.

## Publishing State to HA

The plugin can push OmniDeck orchestrator state **to** Home Assistant, enabling HA automations like "dim the lights when I start playing Call of Duty" or "turn off the office when no computer is active for 15 minutes."

### Configuration

```yaml
plugins:
  home-assistant:
    url: ws://homeassistant.local:8123/api/websocket
    token: !secret ha_token
    publish:
      enabled: true
      method: events           # "events" or "input_helpers"
      update_interval_ms: 5000 # how often to push state
      active_device: true      # which computer is focused
      active_window: true      # current app name
      device_presence: true    # per-device online/offline
      idle_time: false         # per-device idle time in ms
      entity_prefix: omnideck  # prefix for input helper entity IDs
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `false` | Enable state publishing |
| `method` | string | `"events"` | `"events"` fires `omnideck_state` events; `"input_helpers"` updates input_* entities |
| `update_interval_ms` | number | `5000` | How often to publish (ms) |
| `active_device` | boolean | `true` | Include focused device hostname |
| `active_window` | boolean | `true` | Include active window app name |
| `device_presence` | boolean | `true` | Include per-device online/offline |
| `idle_time` | boolean | `false` | Include per-device idle time |
| `entity_prefix` | string | `"omnideck"` | Prefix for input helper entity IDs |

### Method: Events

Fires an `omnideck_state` event on the HA event bus with all enabled data. Zero setup required on the HA side.

**Example HA automation:**

```yaml
automation:
  - alias: "Gaming mode"
    trigger:
      - platform: event
        event_type: omnideck_state
    condition:
      - condition: template
        value_template: "{{ trigger.event.data.active_window_app == 'Call of Duty' }}"
    action:
      - service: scene.turn_on
        target:
          entity_id: scene.gaming_ambient
```

### Method: Input Helpers

Updates HA input helper entities directly, making the state available on dashboards and in template sensors. Requires creating the helpers in HA first:

- `input_text.omnideck_active_device`
- `input_text.omnideck_active_window`
- `input_boolean.omnideck_{hostname}_online` (one per device)

**Example HA automation using input helpers:**

```yaml
automation:
  - alias: "Office auto-off"
    trigger:
      - platform: state
        entity_id: input_boolean.omnideck_macbook_online
        to: "off"
        for: "00:15:00"
    action:
      - service: light.turn_off
        target:
          entity_id: light.office
```

## Web API

The plugin exposes entity browsing endpoints for the config UI:

| Endpoint | Description |
|----------|-------------|
| `GET /api/ha/entities?domain=light&q=office` | List entities, filter by domain and/or search |
| `GET /api/ha/domains` | List all available entity domains |
| `GET /api/ha/entities/{entity_id}` | Get a single entity's current state |
| `GET /api/ha/status` | Connection status, HA version, entity counts |

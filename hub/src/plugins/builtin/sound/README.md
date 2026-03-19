# Sound Plugin

System audio controls — volume, mute, mic mute, and audio device switching. Commands are sent to OmniDeck agents running on target machines.

**Plugin ID:** `sound`

## Configuration

```yaml
plugins:
  sound:
    default_target: macbook   # agent hostname
    default_step: 5           # volume step percentage (default: 5)
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `default_target` | string | — | Hostname of the default target agent |
| `default_step` | number | `5` | Default volume increment/decrement percentage |

## Actions

All actions accept an optional `target` param. Falls back to the focused agent, then `default_target`.

| Action | Params | Description |
|--------|--------|-------------|
| `sound.mute` | — | Mute system audio |
| `sound.unmute` | — | Unmute system audio |
| `sound.toggle_mute` | — | Toggle system mute |
| `sound.mic_mute` | — | Mute microphone |
| `sound.mic_unmute` | — | Unmute microphone |
| `sound.toggle_mic_mute` | — | Toggle mic mute |
| `sound.volume_up` | `step` (number) | Raise volume by step % |
| `sound.volume_down` | `step` (number) | Lower volume by step % |
| `sound.change_output_device` | `device` (string) | Switch audio output device |
| `sound.change_input_device` | `device` (string) | Switch audio input device |

## State Providers

### `sound.volume_level`

Shows current volume percentage with a progress bar. Icon adapts: `volume_off` at 0, `volume_down` at 1-50, `volume_up` above 50.

### `sound.mute_state`

Shows mute status. Red background when muted.

### `sound.mic_state`

Shows mic mute status. Red background when muted.

All state providers accept `{ target: "hostname" }`.

## Presets

### `sound.volume_up` / `sound.volume_down`

```yaml
- pos: [0, 0]
  preset: sound.volume_up
  params: { step: 10, target: macbook }
```

### `sound.mute_toggle`

Toggle mute with live state feedback (red when muted).

```yaml
- pos: [1, 0]
  preset: sound.mute_toggle
  params: { target: macbook }
```

### `sound.mic_mute_toggle`

Toggle mic mute with live state feedback.

```yaml
- pos: [2, 0]
  preset: sound.mic_mute_toggle
  params: { target: macbook }
```

### `sound.volume_display`

Read-only volume display with progress bar. No action on press.

```yaml
- pos: [3, 0]
  preset: sound.volume_display
  params: { target: macbook }
```

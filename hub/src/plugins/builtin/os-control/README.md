# OS Control Plugin

Controls remote computers via OmniDeck agents. Launch apps, send keystrokes, adjust volume, lock/sleep machines, and switch audio devices.

All actions are dispatched to the agent running on the target machine.

**Plugin ID:** `os-control`

## Configuration

```yaml
plugins:
  os-control:
    default_target: macbook  # hostname of the default target agent
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `default_target` | string | — | Hostname of the agent to target when no explicit `target` is specified. Falls back to the currently focused agent. |

## Actions

Every action accepts an optional `target` param (agent hostname). If omitted, uses the focused agent or `default_target`.

### `os-control.launch_app`

```yaml
- pos: [0, 0]
  action: os-control.launch_app
  params: { app: "Firefox", target: macbook }
  icon: ms:open_in_browser
```

### `os-control.focus_app`

Bring an already-running app to the foreground.

```yaml
params: { app: "Slack" }
```

### `os-control.send_keystroke`

Send a keyboard shortcut to the target machine.

```yaml
params: { key: "space", modifiers: ["cmd"] }
```

### `os-control.set_volume` / `os-control.set_mic_volume`

```yaml
params: { level: 50 }
```

### `os-control.sleep` / `os-control.lock`

No params required. Puts the target machine to sleep or locks it.

### `os-control.switch_audio_output` / `os-control.switch_audio_input`

```yaml
params: { device: "MacBook Pro Speakers" }
```

## State Providers

### `os-control.active_window`

Shows the active window title on the target machine.

```yaml
state:
  provider: os-control.active_window
  params: { target: macbook }
```

### `os-control.volume_level`

Shows system volume as a label + progress bar.

```yaml
state:
  provider: os-control.volume_level
  params: { target: macbook }
```

### `os-control.app_running`

Dims the button (opacity 0.5) when the specified app is not in the foreground.

```yaml
state:
  provider: os-control.app_running
  params: { app: "Firefox", target: macbook }
```

## Presets

### `os-control.app_launcher`

One-liner app launch button. Dims when the app isn't focused.

```yaml
- pos: [0, 0]
  preset: os-control.app_launcher
  params: { app: "Firefox", target: macbook }
  icon: ms:open_in_browser
  label: Firefox
```

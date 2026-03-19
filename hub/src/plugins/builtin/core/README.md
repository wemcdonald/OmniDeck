# Core Plugin

Built-in plugin that provides deck navigation and system controls. Always loaded — no configuration needed.

**Plugin ID:** `omnideck-core`

## Actions

### `omnideck-core.change_page`

Switch to a different page.

```yaml
- pos: [0, 0]
  action: omnideck-core.change_page
  params: { page: media }
  icon: ms:music_note
  label: Media
```

| Param | Type | Description |
|-------|------|-------------|
| `page` | string | Page ID to switch to |

### `omnideck-core.go_back`

Return to the previous page (stack-based history).

```yaml
- pos: [4, 2]
  action: omnideck-core.go_back
  icon: ms:arrow_back
  label: Back
```

### `omnideck-core.set_brightness`

Set deck display brightness.

```yaml
- pos: [4, 0]
  action: omnideck-core.set_brightness
  params: { brightness: 50 }
  icon: ms:brightness_medium
```

| Param | Type | Description |
|-------|------|-------------|
| `brightness` | number | 0-100 |

### `omnideck-core.sleep_deck`

Turn off the deck display.

```yaml
- pos: [4, 2]
  action: omnideck-core.sleep_deck
  icon: ms:dark_mode
  label: Sleep
```

### `omnideck-core.reload_config`

Reload all YAML configuration files.

```yaml
- pos: [4, 2]
  action: omnideck-core.reload_config
  icon: ms:refresh
  label: Reload
```

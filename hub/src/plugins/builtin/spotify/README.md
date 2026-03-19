# Spotify Plugin

Controls Spotify playback and displays now-playing information. Connects via the Spotify Web API with OAuth refresh tokens. Polls for playback state every 2 seconds by default.

**Plugin ID:** `spotify`

## Configuration

```yaml
plugins:
  spotify:
    client_id: !secret spotify_client_id
    client_secret: !secret spotify_client_secret
    refresh_token: !secret spotify_refresh_token
    poll_interval: 2000  # ms (optional, default: 2000)
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `client_id` | string | **required** | Spotify app client ID |
| `client_secret` | string | **required** | Spotify app client secret |
| `refresh_token` | string | **required** | OAuth refresh token |
| `poll_interval` | number | `2000` | Polling interval in ms |

### Getting Spotify Credentials

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Set a redirect URI (e.g. `http://localhost:8888/callback`)
3. Use the Authorization Code flow to obtain a refresh token with scopes: `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`

## Actions

| Action | Params | Description |
|--------|--------|-------------|
| `spotify.play_pause` | `is_playing` (bool, optional) | Toggle or explicit play/pause |
| `spotify.next` | — | Skip to next track |
| `spotify.previous` | — | Skip to previous track |
| `spotify.set_volume` | `volume_percent` (0-100) | Set Spotify volume |
| `spotify.transfer_playback` | `device_id`, `play` (bool) | Move playback to a device |
| `spotify.toggle_shuffle` | `state` (bool) | Enable/disable shuffle |
| `spotify.toggle_repeat` | `state` ("off"/"track"/"context") | Set repeat mode |

## State Providers

### `spotify.now_playing`

Shows current track name, artist, album art, and playback progress bar.

### `spotify.playback_state`

Shows play/pause icon with Spotify green background when playing. Badges: **S** for shuffle, **R** for repeat.

### `spotify.device_list`

Shows the active Spotify Connect device name and a badge with the total device count.

## Presets

### `spotify.play_pause_button`

Play/pause toggle with live playback state.

```yaml
- pos: [0, 0]
  preset: spotify.play_pause_button
```

### `spotify.now_playing_display`

Read-only display of the current track with album art and progress bar.

```yaml
- pos: [1, 0]
  preset: spotify.now_playing_display
```

### `spotify.skip_controls`

Skip forward (default) or backward.

```yaml
- pos: [2, 0]
  preset: spotify.skip_controls
  params: { direction: next }

- pos: [3, 0]
  preset: spotify.skip_controls
  params: { direction: previous }
  icon: skip-back
```

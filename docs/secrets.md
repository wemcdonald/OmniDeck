← [Docs](README.md)

# Secrets

## What is secrets.yaml?

`~/.omnideck/secrets.yaml` stores sensitive values — API tokens, passwords, OAuth secrets — separately from your main config. The pattern is borrowed from Home Assistant.

```yaml
# ~/.omnideck/secrets.yaml
ha_token: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
spotify_client_secret: "abc123..."
weather_api_key: "def456..."
```

Keep this file out of version control. The install script adds `secrets.yaml` to `.gitignore` automatically.

## Using !secret in config.yaml

Reference a secret value in `config.yaml` with the `!secret` YAML tag:

```yaml
plugins:
  home-assistant:
    url: ws://homeassistant.local:8123/api/websocket
    token: !secret ha_token

  weather:
    api_key: !secret weather_api_key
    city: "San Francisco"
```

At load time the hub resolves each `!secret` tag by looking up the key in `secrets.yaml`. If a key is missing, the hub logs a warning and the affected plugin fails to initialize.

## Web UI behavior

The web UI never shows secret values. For each secret field in a plugin's config, the UI displays one of two states:

- **Set** — a masked placeholder (`••••••••`) with a "Change" button
- **Not set** — an empty field with a prompt to enter the value

When you save a plugin config from the web UI:
- If you leave a secret field unchanged (still showing `••••••••`), the existing value in `secrets.yaml` is preserved
- If you type a new value, it replaces the existing one in `secrets.yaml`
- Secret values are never included in the config JSON sent from the browser to the hub

## Manually editing secrets.yaml

You can edit `secrets.yaml` directly on the Pi. The hub hot-reloads secrets on file change — no restart needed. Use any text editor:

```bash
nano ~/.omnideck/secrets.yaml
```

Secret keys must be plain strings (no nesting). Values can be any YAML scalar — strings, numbers, booleans:

```yaml
ha_token: "long-lived-access-token-here"
slack_token: "xoxb-..."
some_port: 8080
```

## Backing up your config with git-crypt

If you version-control your `~/.omnideck/` directory, encrypt `secrets.yaml` before committing:

```bash
# In your ~/.omnideck/ git repo
git-crypt init
echo "secrets.yaml filter=git-crypt diff=git-crypt" >> .gitattributes
git-crypt add-gpg-user YOUR_GPG_KEY_ID
```

With git-crypt in place, `secrets.yaml` is encrypted on disk in the repo but transparently decrypted in your working tree. See the [git-crypt docs](https://github.com/AGWA/git-crypt) for setup details.

## Example: adding a secret manually

Say you're installing the Weather plugin and have an OpenWeatherMap API key. Add it to `secrets.yaml`:

```yaml
# ~/.omnideck/secrets.yaml
weather_api_key: "your-openweathermap-api-key"
```

Then reference it in `config.yaml`:

```yaml
plugins:
  weather:
    api_key: !secret weather_api_key
    city: "New York"
    units: imperial
```

The hub resolves the reference at load time. If you later change the key value in `secrets.yaml`, the hub picks it up automatically on the next file-watch cycle.

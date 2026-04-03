# OmniDeck Documentation

← [Back to OmniDeck](../README.md)

---

## Setup

| | |
|---|---|
| **[Getting Started](getting-started.md)** | Install the hub on a Raspberry Pi, install the agent on your Mac/PC, connect your Stream Deck, and configure your first buttons. Start here. |
| **[Configuration Reference](configuration.md)** | Full reference for `config.yaml` — deck settings, plugin config, page layout, and all available options. |
| **[Secrets](secrets.md)** | How to store API tokens and passwords in `secrets.yaml` using `!secret` references so they stay out of your main config. |

## Plugins

| | |
|---|---|
| **[Installing Plugins](plugin-install.md)** | Install plugins from the OmniDeck web UI or manually from the [OmniDeck-plugins](https://github.com/wemcdonald/OmniDeck-plugins) repo. |
| **[Writing a Plugin](plugin-guide.md)** | Build a plugin from scratch: actions, state providers, presets, schema-driven config UI, secrets, and smart targeting. |

## Reference

| | |
|---|---|
| **[How It Works](how-it-works.md)** | User-facing architecture explanation — hub/agent split, plugin types, smart targeting, and secrets. |
| **[Architecture Specification](ARCHITECTURE.md)** | Full technical deep-dive — protocols, data flow, renderer, agent SDK, and internal APIs. |

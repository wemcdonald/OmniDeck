# OmniDeck

Stream-Deck-style customizable button control surface. Three pieces:

- **hub** — Node server that renders pages, owns device config, talks to agents
- **agent** — Bun process on each controlled host; runs plugins, speaks to
  its paired hubs over WebSocket
- **agent-app** — Tauri tray app that supervises the agent sidecar and
  handles pairing UX

## Multi-hub architecture

An agent may be paired with **more than one hub** at a time. Everything below
is about that.

### Paired hubs (`credentials.json` v2)

```json
{
  "version": 2,
  "hubs": [
    {
      "agent_id": "…",
      "token": "…",
      "hub_address": "wss://hub-a.local:4443",
      "hub_name": "Home",
      "ca_cert": "-----BEGIN CERTIFICATE-----…",
      "cert_fingerprint_sha256": "aa:bb:cc:…"
    }
  ]
}
```

Legacy v1 (bare `AgentCredentials` object) is auto-migrated on load — see
`agent/src/credentials.ts`. Per-hub `cert_fingerprint_sha256` is what lets
the agent rediscover the hub on a new IP via mDNS.

### Per-hub fan-out (`Agent.hubPlugins`)

Each paired hub sends a `plugin_manifest` announcing which plugins it wants
rendered. The agent stores this per `agentId` and filters outbound messages:

- `plugin_state` / `plugin_log` / `plugin_active` only reach hubs that
  announced that `pluginId` (`broadcastForPlugin` in `agent/src/agent.ts`).
- `plugin_state` cached from before a hub connected is **replayed only to
  the connecting hub** and only for plugins that hub asked for
  (`replayStateCache`). A hub never receives state for plugins it has no
  button for.
- When a hub is unpaired, any plugin no *remaining* hub wants is unloaded
  (`unloadOrphanedPlugins`). Loaded plugins = union of all paired hubs'
  desired sets.

### StateCache

In-memory `(pluginId, key) → lastValue` map (`agent/src/state-cache.ts`).
Every `plugin_state` push is recorded. On hub (re)connect the agent replays
the cache so the hub doesn't have to wait for the next poll cycle to
redraw.

### Fingerprint pinning (mDNS reconnect)

`HubResolver` (`agent/src/mdns-resolver.ts`) continuously browses
`_omnideck-hub._tcp`. Subscribers register with a **fingerprint**, not a
hostname — so when a hub's IP changes (DHCP, Wi-Fi hop) the agent still
finds it, and a different hub advertising with the same display name is
ignored. The subscription is keyed on `cert_fingerprint_sha256`, matched
against the `fp` TXT record.

### Plugin config divergence

Two paired hubs may ship different config for the same plugin. The agent
keeps last-writer-wins semantics (anything else would leave plugins
misconfigured), but logs a warn whenever incoming config differs from the
value previously applied by a different hub. Look for
`Plugin config divergence for <id>` in the agent log.

### Tray menu behavior

`agent-app/src-tauri/src/tray.rs`:

- 1 hub paired — top item shows "Connected to <hub>", single "Unpair Hub"
  entry at the bottom.
- 2+ hubs paired — tooltip shows "N/M hubs connected"; the "Unpair Hub"
  item becomes a submenu with one row per hub. Selecting one unpairs only
  that hub; the agent keeps its connections to the others alive (no
  sidecar restart).
- Pair flow adds a hub via the sidecar's `add_hub` stdin IPC when possible,
  falling back to full restart. The `PairingDialog` grays out discovered
  hubs whose fingerprint is already in the paired list.

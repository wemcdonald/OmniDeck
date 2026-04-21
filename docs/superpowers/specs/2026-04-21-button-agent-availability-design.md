# Button Disabled State Based on Agent Availability

**Date:** 2026-04-21
**Status:** Approved for implementation

## Problem

Most buttons on an OmniDeck page dispatch to a plugin that runs on an
agent (e.g. sound volume on a Mac, os-control window focus, Spotify
playback). When the target agent is not currently connected — host
powered off, on a different network, unpaired, etc. — pressing the
button silently fails: the dispatch goes out, no agent picks it up,
nothing visible happens. The user has no way to know a button won't
work before pressing it.

This feature makes unavailable buttons visually disabled and inert.

## Goals

- Buttons whose dependent agent is offline appear dimmed on the deck.
- Pressing a disabled button does nothing (no dispatch, no error log).
- State stays in sync automatically as agents join / leave.
- Hub-local plugins (core, modes, Home Assistant, orchestrator) are
  never disabled — they have no agent dependency.

## Non-goals

- New per-button config fields (`requires_agent`, `available_on`).
  The existing routing logic already expresses the dependency.
- Press feedback on disabled buttons (toast, flash, haptic). Inert is
  the chosen behavior.
- Per-action disabled state within a multi-action button. A button is
  either fully enabled or fully disabled.

## Design

### Availability rule

For each button, determine its primary plugin. The action (or each
action in an action list) has the form `"<pluginId>.<command>"`;
split on the first dot to get the pluginId, then look up the plugin
in the registry. A button with only a `preset` resolves through the
preset table in the same way. Then:

```
isAvailable(button):
  plugin = resolvePrimaryPlugin(button)
  if plugin has no agent-side code       → true
  if button.target is set:
    return connectedAgents.has(button.target)
  return resolveTarget(button, pluginId) !== null
```

`resolveTarget()` (hub/src/orchestrator/resolver.ts) already
encapsulates all four routing tiers — explicit pin, plugin
`active_agent`, focused device, config fallback order — and
returns `null` when no connected agent can service the action.
We reuse it unchanged, which keeps "button is enabled" and
"press would dispatch" in sync by construction.

**Multi-action buttons** are disabled only when *all* of their
actions resolve to an unavailable agent. A button that mixes a
hub-local action with an agent-routed action stays enabled.

### Where the check lives

New pure-function module `hub/src/orchestrator/availability.ts`:

```ts
export function isButtonAvailable(
  button: ButtonConfig,
  registry: PluginRegistry,
  connectedAgents: Set<string>,
  state: StateStore,
): boolean
```

Called from two sites:

1. **Render path** — `Hub.resolveButtonState()` in
   `hub/src/hub.ts` around line 1243. After state providers run,
   if `!isAvailable` and no provider has already set a lower
   opacity, set `state.opacity = 0.4`.

2. **Press path** — the action dispatch entry point. If
   `!isAvailable`, return immediately. No dispatch, no error log.

Routing both sites through a single function guarantees render
and dispatch stay consistent.

### Reactivity

Availability depends on the `connectedAgents` set, which changes
on agent join / leave.

Hook into the existing `deviceConnected` / `deviceDisconnected`
handlers in `hub.ts` (around lines 196–232, where
`orchestrator.connected_agents` is already published). After that
publish, trigger a re-render pass for the buttons on currently
rendered pages whose primary plugin has agent-side code. Buttons
bound to hub-local plugins are skipped by construction.

For a typical deck (~15–32 buttons), this is a handful of
`resolveButtonState()` evaluations per agent event — cheap enough
that we don't need a finer-grained invalidation scheme.

### Visual treatment

Reuse the existing unavailable visual: `state.opacity = 0.4`,
matching Home Assistant's unavailable entities
(`hub/src/plugins/builtin/home-assistant/state.ts`) and
os-control's inactive app launcher
(`hub/src/plugins/builtin/os-control/index.ts`). No renderer
changes — `renderer.ts:379–384` already darkens on opacity < 1.

If a state provider has already set a lower opacity (e.g. HA
entity unavailable), leave that value. Availability does not
raise opacity, only lowers it toward 0.4.

### Pinned-agent behavior

When a button has `target: "macbook"` and macbook is offline:
`resolveTarget()` returns `null` (Tier 1 requires the target be
in `connectedAgents`). The button disables via the general rule.
On macbook reconnect, the reactivity hook re-renders and the
button enables. No special case needed.

## Testing

Unit tests for `isButtonAvailable()`:

- Button bound to a hub-local plugin → always available.
- Pinned-agent button, target online → available.
- Pinned-agent button, target offline → unavailable.
- Capability-routed button, matching active_agent online → available.
- Capability-routed button, no candidate online → unavailable.
- Multi-action button, one action hub-local, one agent-routed with
  agent offline → available (the hub-local action saves it).
- Multi-action button, all actions agent-routed and unavailable →
  unavailable.

Integration test in `hub.test.ts`:

- Connect an agent, render a page with a button targeting that
  agent, assert normal opacity.
- Disconnect the agent, assert the button re-renders with
  `opacity: 0.4`.
- Simulate a press on the disabled button, assert no dispatch is
  emitted to the (now absent) agent and no error is logged.

## Files touched

| File | Change |
|------|--------|
| `hub/src/orchestrator/availability.ts` | New module, `isButtonAvailable()` |
| `hub/src/orchestrator/__tests__/availability.test.ts` | New, unit tests |
| `hub/src/hub.ts` | Wire into `resolveButtonState()` and dispatch path; trigger re-render on agent connect/disconnect |
| `hub/src/__tests__/hub.test.ts` | Integration test for disable-on-disconnect |

## Out of scope

- Extending `ButtonConfigSchema` with availability fields.
- Changing `renderer.ts` — the existing opacity path suffices.
- Press feedback UI for disabled buttons.
- Partial disable within multi-action buttons.

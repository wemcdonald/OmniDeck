# Agent Pairing UX Improvements — Design

**Date:** 2026-04-20
**Status:** Approved for implementation planning

## Problem

Four independent gaps in the agent pairing experience:

1. No way to unpair an agent from the agent-app side.
2. Agent-app fails to discover the hub on the local network on macOS, even when the hub is actively advertising via mDNS and reachable from the OS-level browser (`dns-sd`).
3. Manual hub address entry rejects bare hostnames: `myhub.local` resolves to `wss://myhub.local` (port 443), so users must know to type `wss://myhub.local:9210` to connect.
4. The hub's `/agents` page does not update when a new agent pairs or an agent is revoked elsewhere — users must refresh the browser.

## Diagnosis (discovery failure)

Verified by running the bundled sidecar binary directly on the Mac:

```
/Applications/OmniDeck\ Agent.app/Contents/MacOS/omnideck-agent --managed --discover
```

→ Hub discovered correctly. `dns-sd -B _omnideck-hub._tcp` on the same Mac also sees the advertisement.

The sidecar only fails to discover when spawned as a child of the Tauri app (`omnideck-agent-app`). macOS Sonoma (14+) requires all apps using Bonjour/mDNS to declare:

- `NSLocalNetworkUsageDescription` in `Info.plist`
- `NSBonjourServices` array naming the service types they browse

Neither key is present in the current bundle's `Info.plist`. Without them, TCC silently denies multicast, and child processes inherit the parent's denied state. Running the sidecar from a terminal works because Terminal has its own granted permission.

## Design

### 1. Unpair (both sides in sync)

**Agent-app tray menu:** add "Unpair Hub" item, shown when state is `Connected` or any paired state.

**Flow:**

The agent communicates with the hub over the authenticated agent WebSocket (port 9210). The web API (port 28120) is not reachable from credentials alone, since `hub_address` stores only the WS URL. Use the WS channel for revocation.

1. New protocol message `unpair_request` (agent → hub) added in `hub/src/server/protocol.ts`. Hub handler calls `PairingManager.revokeAgent(agentId)` for the authenticated agent, replies with `unpair_response { success: true }`, then closes the socket.
2. `cmd_unpair` in `agent-app/src-tauri/src/lib.rs`:
   a. Ask the running sidecar to send `unpair_request` via the existing stdin JSON channel (add a `{type:"unpair"}` command the sidecar listens for).
   b. Wait up to 3 seconds for `{type:"unpaired"}` confirmation from sidecar stdout. Continue on timeout — hub may be offline.
   c. Stop the sidecar.
   d. Delete `credentials.json`.
   e. Emit `agent-status: NotPaired`, refresh tray.
   f. Show the pairing window.

If the agent is not currently connected to the hub, step (a) still returns immediately (sidecar reports "not connected") and we clear local state anyway. The hub's paired registry will show the agent as stale, and the user can use the hub's existing Revoke button as cleanup.

**Hub-initiated revoke — notify connected agent:**

When `PairingManager.revokeAgent(agentId)` is called and that agent is currently connected, the hub sends `{type:"revoked"}` and closes the socket with close code 4401. The agent treats a `revoked` message (or close code 4401) the same as `onAuthFailed`: delete credentials, emit `NotPaired`.

This keeps both directions symmetric: whether the user clicks "Unpair" in the tray or "Revoke" in the hub UI, both sides end in the same clean state.

### 2. macOS Local Network permission

Add to `agent-app/src-tauri/tauri.conf.json` under `bundle.macOS`:

```json
"infoPlist": {
  "NSLocalNetworkUsageDescription": "OmniDeck Agent needs local network access to find your OmniDeck Hub.",
  "NSBonjourServices": ["_omnideck-hub._tcp"]
}
```

If the Tauri v2 bundler does not honor inline `infoPlist`, fall back to a `src-tauri/Info.plist` file merged by the bundler. Verify with a test build before committing.

**Upgrade path for existing users:** after installing the new build, macOS prompts on first discovery. If a user previously denied the permission (unlikely — they were never prompted, since the key was missing), they can toggle in System Settings → Privacy & Security → Local Network.

**UX polish in pairing dialog (`agent-app/src/PairingDialog.tsx`):**

- When discovery returns zero hubs, show "Retry scan" button that re-invokes `cmd_discover_hubs`.
- Copy: "No hubs found. Check the hub is running and on the same network, or enter an address below."
- On macOS only, offer a link "Open Local Network Settings" → `x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork`.

### 3. Hostname normalization

Replace inline `hubUrl` computation in `agent-app/src/PairingDialog.tsx` with a pure helper:

```ts
export function normalizeHubUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const stripped = trimmed.replace(/^(wss?|https?):\/\//i, "");
  const hasPort = /:\d+$/.test(stripped);
  return `wss://${stripped}${hasPort ? "" : ":9210"}`;
}
```

Accepted inputs:

| Input | Output |
|-------|--------|
| `myhub` | `wss://myhub:9210` |
| `myhub.local` | `wss://myhub.local:9210` |
| `192.168.1.5` | `wss://192.168.1.5:9210` |
| `myhub:9999` | `wss://myhub:9999` |
| `https://myhub.local` | `wss://myhub.local:9210` |
| `wss://myhub.local:9210` | `wss://myhub.local:9210` |

Default port `9210` should be a named constant. Reuse the hub-side constant if exported; otherwise define `DEFAULT_HUB_PORT = 9210` in the pairing dialog with a comment pointing at the hub config.

Input placeholder becomes `"myhub.local or 192.168.1.50"`.

Unit tests cover each row of the table above.

### 4. Live refresh on the hub's Agents page

**Broadcast contract** (`hub/src/web/broadcast.ts`):

```ts
| { type: "pairing:update"; data: PairedAgent[] }
```

`PairedAgent` as returned by `PairingManager.listAgents()` (token_hash already redacted).

**Wiring** (`PairingManager`):

- Add an optional `onChange?: (agents: PairedAgent[]) => void` constructor parameter (or a `setOnChange` setter).
- Invoke after every mutating operation: `registerAgent`, `revokeAgent`. `updateLastSeen` does NOT fire `onChange` — too noisy; the list endpoint returns it on demand.

**Hub wiring** (`hub/src/hub.ts` or wherever `PairingManager` is constructed): pass a callback that calls `broadcaster.send({type:"pairing:update", data})`.

**Web side** (`hub/web/src/pages/Agents.tsx`):

- In a `useEffect`, subscribe to `pairing:update` via the existing `useWebSocket` hook.
- On event: `queryClient.setQueryData(["pairing","agents"], msg.data)` — direct cache write, no refetch.
- Unsubscribe on unmount.

No new REST endpoint, no polling.

## Out of Scope

- Multi-hub support on the agent. One hub per agent.
- Discovering hubs across subnets or via DNS-SD wide-area records.
- Unpair UI inside the hub's web Devices page (already has Revoke).
- Rate limiting / auth for the revoke endpoint beyond the existing scheme.

## Testing

Each change ships with targeted tests:

- **Unpair flow:** integration test at the `cmd_unpair` boundary — mock hub DELETE endpoint, assert creds deleted, sidecar stopped, `NotPaired` emitted; assert creds deleted even when DELETE fails.
- **Local Network permission:** manual verification — fresh install on macOS, confirm prompt appears, confirm discovery works after granting.
- **Hostname normalization:** unit tests for `normalizeHubUrl` covering each row in the table.
- **Live refresh:** hub-side unit test that registering/revoking emits `pairing:update` with correct payload; web-side test that receiving the event updates the query cache.

## Files Touched (estimated)

- `agent-app/src-tauri/tauri.conf.json`
- `agent-app/src-tauri/src/lib.rs` (rewrite `cmd_unpair`)
- `agent-app/src-tauri/src/tray.rs` (add tray menu item)
- `agent-app/src/PairingDialog.tsx` (normalize hostname, retry button, empty-state copy)
- `agent/src/index.ts` (handle new `unpair` stdin command, emit `unpaired` to Tauri)
- `agent/src/agent.ts` (send `unpair_request` over WS; handle `revoked` message + close code 4401)
- `hub/src/server/protocol.ts` (add `unpair_request` / `unpair_response` / `revoked` message types)
- `hub/src/server/server.ts` (handle `unpair_request`; emit `revoked` + close 4401 on hub-side revoke)
- `hub/src/server/pairing.ts` (add `onChange` callback)
- `hub/src/hub.ts` (wire `onChange` → broadcaster)
- `hub/src/web/broadcast.ts` (add `pairing:update` variant)
- `hub/web/src/pages/Agents.tsx` (subscribe to `pairing:update`)
- New tests alongside each file.

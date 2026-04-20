# Agent Pairing UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four pairing gaps — unpair (both sides), failed mDNS discovery on macOS, bare-hostname rejection, and stale Agents page.

**Architecture:** Four independent slices sharing the existing agent ↔ hub WebSocket protocol. Unpair reuses the authenticated WS channel (no new HTTP path). Agents-page refresh uses the existing broadcaster. Discovery fix is a bundle-config change. Hostname normalization is a pure helper in the pairing dialog.

**Tech Stack:** TypeScript (agent + hub), React (hub web UI + Tauri agent-app), Rust (Tauri shell), `ws`, `bonjour-service`, Hono, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-20-agent-pairing-ux-design.md`

---

## File Structure

**New:**
- `agent-app/src/hubUrl.ts` — pure `normalizeHubUrl` helper (easier to unit-test than inline in `PairingDialog.tsx`).
- `agent-app/src/__tests__/hubUrl.test.ts` — unit tests for normalizer.
- `hub/src/server/__tests__/pairing.onChange.test.ts` — unit test for onChange hook.
- `hub/src/server/__tests__/server.unpair.test.ts` — integration test for unpair_request + revoke-disconnect.

**Modified:**
- `agent-app/src-tauri/tauri.conf.json` — add `bundle.macOS.infoPlist` with Bonjour keys.
- `agent-app/src-tauri/src/lib.rs` — rewrite `cmd_unpair` to drive sidecar IPC.
- `agent-app/src-tauri/src/sidecar.rs` — handle new `unpaired` message from sidecar stdout.
- `agent-app/src-tauri/src/tray.rs` — add "Unpair Hub" menu item (only shown when paired).
- `agent-app/src/PairingDialog.tsx` — use normalizer, add retry button, empty-state copy, macOS settings link.
- `agent/src/index.ts` — accept `unpair` command on stdin; emit `unpaired`.
- `agent/src/agent.ts` — add `sendUnpairRequest`; handle `revoked` message and close code 4401.
- `agent/src/ws/client.ts` — surface WS close code to `onDisconnected` callback so revoke can be detected.
- `agent/src/ws/protocol.ts` — add `UnpairResponseData`.
- `hub/src/server/protocol.ts` — add `UnpairResponseData` + close-code constant.
- `hub/src/server/pairing.ts` — add optional `onChange` callback; invoke on register/revoke.
- `hub/src/server/server.ts` — handle `unpair_request`; on revoke, send `revoked` and close 4401.
- `hub/src/hub.ts` — wire `PairingManager.onChange` → broadcaster; pass broadcaster into agent server.
- `hub/src/web/broadcast.ts` — add `pairing:update` variant.
- `hub/web/src/pages/Agents.tsx` — subscribe to `pairing:update`; update query cache.

---

## Task 1: Extract and test `normalizeHubUrl`

**Files:**
- Create: `agent-app/src/hubUrl.ts`
- Create: `agent-app/src/__tests__/hubUrl.test.ts`
- Modify: `agent-app/src/PairingDialog.tsx` (lines 31-35, 103-110)

- [ ] **Step 1.1: Confirm agent-app test runner**

Run: `cd /opt/omnideck/agent-app && cat package.json | grep -E '"(test|vitest|jest)"'`
Expected: some test script exists (probably `vitest`). If none, add vitest as dev dep and `"test": "vitest run"` in `scripts`.

If vitest missing:
```bash
cd /opt/omnideck/agent-app && pnpm add -D vitest @vitest/coverage-v8 jsdom
```
Append to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`.

- [ ] **Step 1.2: Write failing test**

Create `agent-app/src/__tests__/hubUrl.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeHubUrl, DEFAULT_HUB_PORT } from "../hubUrl";

describe("normalizeHubUrl", () => {
  it("returns empty for empty input", () => {
    expect(normalizeHubUrl("")).toBe("");
    expect(normalizeHubUrl("   ")).toBe("");
  });

  it("adds wss:// and default port to bare hostname", () => {
    expect(normalizeHubUrl("myhub")).toBe(`wss://myhub:${DEFAULT_HUB_PORT}`);
    expect(normalizeHubUrl("myhub.local")).toBe(`wss://myhub.local:${DEFAULT_HUB_PORT}`);
  });

  it("adds wss:// and default port to IP", () => {
    expect(normalizeHubUrl("192.168.1.5")).toBe(`wss://192.168.1.5:${DEFAULT_HUB_PORT}`);
  });

  it("preserves explicit port", () => {
    expect(normalizeHubUrl("myhub:9999")).toBe("wss://myhub:9999");
    expect(normalizeHubUrl("192.168.1.5:8443")).toBe("wss://192.168.1.5:8443");
  });

  it("strips http/https/ws and re-prefixes wss://", () => {
    expect(normalizeHubUrl("https://myhub.local")).toBe(`wss://myhub.local:${DEFAULT_HUB_PORT}`);
    expect(normalizeHubUrl("http://myhub:9999")).toBe("wss://myhub:9999");
    expect(normalizeHubUrl("ws://myhub.local:9210")).toBe("wss://myhub.local:9210");
  });

  it("is idempotent on already-normalized input", () => {
    const input = "wss://myhub.local:9210";
    expect(normalizeHubUrl(input)).toBe(input);
  });

  it("trims whitespace", () => {
    expect(normalizeHubUrl("  myhub.local  ")).toBe(`wss://myhub.local:${DEFAULT_HUB_PORT}`);
  });
});
```

- [ ] **Step 1.3: Verify test fails**

Run: `cd /opt/omnideck/agent-app && pnpm test -- hubUrl`
Expected: FAIL — `Cannot find module '../hubUrl'`.

- [ ] **Step 1.4: Implement normalizer**

Create `agent-app/src/hubUrl.ts`:
```ts
/** Default hub agent-WebSocket port. Mirrors hub.ts `agentPort` default. */
export const DEFAULT_HUB_PORT = 9210;

export function normalizeHubUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const stripped = trimmed.replace(/^(wss?|https?):\/\//i, "");
  const hasPort = /:\d+$/.test(stripped);
  return `wss://${stripped}${hasPort ? "" : `:${DEFAULT_HUB_PORT}`}`;
}
```

- [ ] **Step 1.5: Verify tests pass**

Run: `cd /opt/omnideck/agent-app && pnpm test -- hubUrl`
Expected: all 7 assertions pass.

- [ ] **Step 1.6: Use normalizer in `PairingDialog.tsx`**

Replace lines 31-35 in `agent-app/src/PairingDialog.tsx`:
```tsx
// Before:
const hubUrl = selectedHub
  ? `wss://${selectedHub.address}:${selectedHub.port}`
  : manualAddress
  ? (manualAddress.startsWith("wss://") ? manualAddress : `wss://${manualAddress}`)
  : "";
```
With:
```tsx
const hubUrl = selectedHub
  ? `wss://${selectedHub.address}:${selectedHub.port}`
  : normalizeHubUrl(manualAddress);
```

Add import at top of file:
```tsx
import { normalizeHubUrl } from "./hubUrl";
```

Update input placeholder on line ~105:
```tsx
placeholder="myhub.local or 192.168.1.50"
```

- [ ] **Step 1.7: Commit**

```bash
cd /opt/omnideck && git add agent-app/src/hubUrl.ts agent-app/src/__tests__/hubUrl.test.ts agent-app/src/PairingDialog.tsx agent-app/package.json
git commit -m "feat(agent-app): normalize manual hub address input"
```

---

## Task 2: macOS Local Network permission (Info.plist)

**Files:**
- Modify: `agent-app/src-tauri/tauri.conf.json` (add `bundle.macOS.infoPlist`)

- [ ] **Step 2.1: Verify Tauri v2 config field**

Run: `cd /opt/omnideck/agent-app && cat node_modules/@tauri-apps/cli/schema.json 2>/dev/null | grep -iE '"infoPlist|NSBonjour"' | head -20`

If `infoPlist` property is documented under `bundle.macOS`, use the inline approach below. If not present in the schema, fall back to creating a file at `src-tauri/Info.plist` — Tauri's bundler merges file values into the generated plist.

- [ ] **Step 2.2: Add infoPlist keys to tauri.conf.json**

In `agent-app/src-tauri/tauri.conf.json`, update the `bundle.macOS` block from:
```json
"macOS": {
  "minimumSystemVersion": "10.15",
  "entitlements": "./Entitlements.plist"
}
```
to:
```json
"macOS": {
  "minimumSystemVersion": "10.15",
  "entitlements": "./Entitlements.plist",
  "infoPlist": {
    "NSLocalNetworkUsageDescription": "OmniDeck Agent needs local network access to find your OmniDeck Hub.",
    "NSBonjourServices": ["_omnideck-hub._tcp"]
  }
}
```

- [ ] **Step 2.3: Verify with a test build**

Run: `cd /opt/omnideck/agent-app && pnpm tauri build --target aarch64-apple-darwin --debug 2>&1 | tail -20` (or whatever target matches the dev Mac)

If the build errors on `infoPlist` being unknown, remove the inline block and instead create `src-tauri/Info.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSLocalNetworkUsageDescription</key>
  <string>OmniDeck Agent needs local network access to find your OmniDeck Hub.</string>
  <key>NSBonjourServices</key>
  <array>
    <string>_omnideck-hub._tcp</string>
  </array>
</dict>
</plist>
```
Then confirm build succeeds and inspect:
```bash
plutil -p "target/release/bundle/macos/OmniDeck Agent.app/Contents/Info.plist" | grep -iE "LocalNetwork|Bonjour"
```
Expected: both keys present.

- [ ] **Step 2.4: Manual verification on Mac**

Install the built `.app`. On first launch of the pairing dialog, macOS should prompt for local-network access. Grant it. Confirm hub appears in the hub list.

If previously denied in a prior build, open `System Settings → Privacy & Security → Local Network` and toggle OmniDeck Agent on.

- [ ] **Step 2.5: Commit**

```bash
cd /opt/omnideck && git add agent-app/src-tauri/tauri.conf.json
# Also add src-tauri/Info.plist if the fallback path was taken
git commit -m "fix(agent-app): declare Bonjour service so mDNS works on macOS"
```

---

## Task 3: Discovery UX polish (retry button, empty-state, settings link)

**Files:**
- Modify: `agent-app/src/PairingDialog.tsx`

- [ ] **Step 3.1: Refactor discovery into a re-invokable function**

In `agent-app/src/PairingDialog.tsx`, hoist the `useEffect` body into a named helper and add state for whether the scan completed at least once.

Replace the existing `useEffect` block (lines 21-29) with:
```tsx
const runDiscovery = async () => {
  setDiscovering(true);
  setHubs([]);
  try {
    const found = await invoke<Hub[]>("cmd_discover_hubs");
    setHubs(found);
    if (found.length === 1) setSelectedHub(found[0]);
  } catch {
    // no-op — empty state handled below
  } finally {
    setDiscovering(false);
  }
};

useEffect(() => {
  void runDiscovery();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 3.2: Update empty-state UI**

Replace the empty-state `<p>` on line 99 with:
```tsx
<div style={styles.emptyState}>
  <p style={styles.discovering}>
    No hubs found. Check the hub is running and on the same network, or enter an address below.
  </p>
  <div style={styles.emptyActions}>
    <button type="button" onClick={() => void runDiscovery()} style={styles.secondaryButton}>
      Retry scan
    </button>
    {isMacOS() && (
      <a
        href="x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork"
        style={styles.settingsLink}
      >
        Open Local Network settings
      </a>
    )}
  </div>
</div>
```

Add helper near the bottom of the file, above `styles`:
```tsx
function isMacOS(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
}
```

Add matching entries to `styles`:
```tsx
emptyState: {
  padding: "8px 0",
},
emptyActions: {
  display: "flex",
  gap: 12,
  alignItems: "center",
  marginTop: 8,
},
secondaryButton: {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #27272a",
  background: "#18181b",
  color: "#fafafa",
  fontSize: 13,
  cursor: "pointer",
},
settingsLink: {
  fontSize: 12,
  color: "#60a5fa",
  textDecoration: "none",
},
```

- [ ] **Step 3.3: Manual smoke test**

Run: `cd /opt/omnideck/agent-app && pnpm tauri dev`

Disconnect Mac from network, open pairing dialog, verify "No hubs found" + retry + settings link render. Reconnect, click "Retry scan", verify hub appears.

- [ ] **Step 3.4: Commit**

```bash
cd /opt/omnideck && git add agent-app/src/PairingDialog.tsx
git commit -m "feat(agent-app): retry scan and settings deep-link when no hubs found"
```

---

## Task 4: `PairingManager.onChange` callback

**Files:**
- Modify: `hub/src/server/pairing.ts`
- Create: `hub/src/server/__tests__/pairing.onChange.test.ts`

- [ ] **Step 4.1: Write failing test**

Create `hub/src/server/__tests__/pairing.onChange.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PairingManager, type PairedAgent } from "../pairing.js";

describe("PairingManager.onChange", () => {
  let dir: string;
  let calls: PairedAgent[][];
  let pm: PairingManager;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pairing-onchange-"));
    calls = [];
    pm = new PairingManager(join(dir, "agents.yaml"), (agents) => {
      calls.push(agents);
    });
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("fires onChange after registerAgent with redacted list", () => {
    const { code } = pm.generateCode();
    expect(pm.validateAndConsumeCode(code)).toBe(true);
    pm.registerAgent("host-a", "Host A", "macos");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(1);
    expect(calls[0][0].name).toBe("Host A");
    expect(calls[0][0].token_hash).toBe("[redacted]");
  });

  it("fires onChange after revokeAgent", () => {
    const { code } = pm.generateCode();
    pm.validateAndConsumeCode(code);
    const { agentId } = pm.registerAgent("host-a", "Host A", "macos");
    calls.length = 0; // reset
    pm.revokeAgent(agentId);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(0);
  });

  it("does NOT fire onChange for updateLastSeen", () => {
    const { code } = pm.generateCode();
    pm.validateAndConsumeCode(code);
    const { agentId } = pm.registerAgent("host-a", "Host A", "macos");
    calls.length = 0;
    pm.updateLastSeen(agentId);

    expect(calls).toHaveLength(0);
  });

  it("does nothing when revoking an unknown id", () => {
    pm.revokeAgent("no-such-agent");
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 4.2: Verify test fails**

Run: `cd /opt/omnideck && pnpm --filter "./hub" test -- pairing.onChange`
Expected: FAIL — constructor takes 1 argument, not 2.

- [ ] **Step 4.3: Add onChange to PairingManager**

In `hub/src/server/pairing.ts`:

1. Change constructor signature:
```ts
constructor(
  registryPath: string,
  private onChange?: (agents: PairedAgent[]) => void,
) {
  this.registryPath = registryPath;
  this.loadRegistry();
}
```

2. After `this.saveRegistry()` in `registerAgent` (line ~102), add:
```ts
this.onChange?.(this.listAgents());
```

3. After `this.saveRegistry()` in `revokeAgent` (line ~123), add:
```ts
this.onChange?.(this.listAgents());
```

Do NOT invoke in `updateLastSeen` — too noisy.

- [ ] **Step 4.4: Verify tests pass**

Run: `cd /opt/omnideck && pnpm --filter "./hub" test -- pairing.onChange`
Expected: all 4 tests pass.

- [ ] **Step 4.5: Commit**

```bash
cd /opt/omnideck && git add hub/src/server/pairing.ts hub/src/server/__tests__/pairing.onChange.test.ts
git commit -m "feat(hub): PairingManager fires onChange on register/revoke"
```

---

## Task 5: Broadcast `pairing:update`

**Files:**
- Modify: `hub/src/web/broadcast.ts`
- Modify: `hub/src/hub.ts` (around line 144-145)

- [ ] **Step 5.1: Add message variant**

In `hub/src/web/broadcast.ts`, add an import and a new union member. After the existing import block at the top, add:
```ts
import type { PairedAgent } from "../server/pairing.js";
```

In the `BroadcastMessage` union, add between `agent:update` and `plugin:status`:
```ts
| { type: "pairing:update"; data: PairedAgent[] }
```

- [ ] **Step 5.2: Wire onChange to broadcaster**

In `hub/src/hub.ts`, replace line 145:
```ts
this.pairing = new PairingManager(this.opts.agentsRegistryPath);
```
with:
```ts
this.pairing = new PairingManager(
  this.opts.agentsRegistryPath,
  (agents) => this.broadcaster.send({ type: "pairing:update", data: agents }),
);
```

- [ ] **Step 5.3: Verify the hub still builds + existing tests pass**

Run: `cd /opt/omnideck && pnpm --filter "./hub" test`
Expected: all tests pass (no behavioural change yet for other tests, just new message wired).

- [ ] **Step 5.4: Commit**

```bash
cd /opt/omnideck && git add hub/src/web/broadcast.ts hub/src/hub.ts
git commit -m "feat(hub): broadcast pairing:update on agent register/revoke"
```

---

## Task 6: Agents page subscribes to `pairing:update`

**Files:**
- Modify: `hub/web/src/pages/Agents.tsx`

- [ ] **Step 6.1: Subscribe and update query cache**

In `hub/web/src/pages/Agents.tsx`:

Add imports near the top:
```tsx
import { useEffect } from "react";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
```
(Note: `useState` and `useEffect` already imported — combine imports.)

Inside `Agents()`, after `revokeAgentMutation` (line ~33), add:
```tsx
const { subscribe } = useWebSocket();

useEffect(() => {
  return subscribe("pairing:update", (msg) => {
    queryClient.setQueryData(["pairing", "agents"], msg.data);
  });
}, [queryClient, subscribe]);
```

- [ ] **Step 6.2: Manual smoke test**

1. Run hub: `cd /opt/omnideck && pnpm --filter "./hub" dev`
2. Open `http://omnideck2.local:28120/agents` in a browser.
3. Generate a pairing code in the UI.
4. From another terminal, simulate pairing by running the agent with `--pair` against the code. Confirm the paired list updates in the browser without a refresh.
5. Click "Revoke" — confirm list updates.

- [ ] **Step 6.3: Commit**

```bash
cd /opt/omnideck && git add hub/web/src/pages/Agents.tsx
git commit -m "feat(web): live-refresh Agents page via pairing:update"
```

---

## Task 7: Add unpair protocol messages

**Files:**
- Modify: `hub/src/server/protocol.ts`
- Modify: `agent/src/ws/protocol.ts`

- [ ] **Step 7.1: Define hub-side types and close-code constant**

In `hub/src/server/protocol.ts`, append after existing interfaces:
```ts
export interface UnpairResponseData {
  success: boolean;
  error?: string;
}

/** WebSocket close code sent to an agent whose credentials were revoked. */
export const WS_CLOSE_CODE_REVOKED = 4401;
```

- [ ] **Step 7.2: Define agent-side types**

In `agent/src/ws/protocol.ts`, append:
```ts
export interface UnpairResponseData {
  success: boolean;
  error?: string;
}

/** WebSocket close code sent by hub when the agent's token is revoked. */
export const WS_CLOSE_CODE_REVOKED = 4401;
```

(Hub and agent have separate protocol files today — mirror the constant/interface rather than introducing cross-package imports.)

- [ ] **Step 7.3: Commit**

```bash
cd /opt/omnideck && git add hub/src/server/protocol.ts agent/src/ws/protocol.ts
git commit -m "feat(protocol): add unpair_request/response and revoke close code"
```

---

## Task 8: Hub handles `unpair_request` and notifies on revoke

**Files:**
- Modify: `hub/src/server/server.ts`
- Create: `hub/src/server/__tests__/server.unpair.test.ts`

- [ ] **Step 8.1: Write failing integration test**

Create `hub/src/server/__tests__/server.unpair.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { AgentServer } from "../server.js";
import { PairingManager } from "../pairing.js";
import { createMessage, parseMessage } from "../protocol.js";

async function waitForMessage(ws: WebSocket, type: string, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    ws.on("message", function handler(data) {
      const msg = parseMessage(data.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off("message", handler);
        resolve(msg);
      }
    });
  });
}

describe("AgentServer unpair flow", () => {
  let dir: string;
  let pm: PairingManager;
  let server: AgentServer;
  let port: number;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "unpair-"));
    pm = new PairingManager(join(dir, "agents.yaml"));
    server = new AgentServer({ port: 0, pairing: pm });
    port = await server.start();
  });

  afterEach(async () => {
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  async function pairAndAuth(): Promise<{ ws: WebSocket; agentId: string; token: string }> {
    const { code } = pm.generateCode();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => ws.once("open", () => r()));

    ws.send(JSON.stringify(createMessage("pair_request", {
      hostname: "h", device_name: "H", platform: "linux",
      agent_version: "0.0.0", pairing_code: code,
    })));
    const resp = await waitForMessage(ws, "pair_response");
    return { ws, agentId: resp.data.agent_id, token: resp.data.token };
  }

  it("unpair_request revokes the agent and closes the socket", async () => {
    const { ws, agentId } = await pairAndAuth();
    // Send a state_update so the server tracks the connection (isNew path)
    ws.send(JSON.stringify(createMessage("state_update", {
      hostname: "h", device_name: "H", platform: "linux", agent_version: "0.0.0",
    })));
    // Small tick so the server records us
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify(createMessage("unpair_request", {})));
    const resp = await waitForMessage(ws, "unpair_response");
    expect(resp.data.success).toBe(true);

    await new Promise<void>((r) => ws.once("close", () => r()));
    expect(pm.listAgents()).toHaveLength(0);
  });

  it("hub-side revoke closes the connection with code 4401", async () => {
    const { ws, agentId } = await pairAndAuth();
    ws.send(JSON.stringify(createMessage("state_update", {
      hostname: "h", device_name: "H", platform: "linux", agent_version: "0.0.0",
    })));
    await new Promise((r) => setTimeout(r, 50));

    const closePromise = new Promise<number>((r) => ws.once("close", (code) => r(code)));
    pm.revokeAgent(agentId);
    const code = await closePromise;
    expect(code).toBe(4401);
  });
});
```

- [ ] **Step 8.2: Verify test fails**

Run: `cd /opt/omnideck && pnpm --filter "./hub" test -- server.unpair`
Expected: FAIL — `unpair_request` not handled, no close on revoke.

- [ ] **Step 8.3: Wire revoke to close connected agent**

In `hub/src/server/server.ts`:

Add import at top:
```ts
import { WS_CLOSE_CODE_REVOKED } from "./protocol.js";
```

Add a map from `agentId → WebSocket` so the server can find the connection on revoke. Near `private agents = new Map<string, ConnectedAgent>();` (line ~68), add:
```ts
private connectionsByAgentId = new Map<string, WebSocket>();
```

In `handleAuthenticate` success path (before `const response`), add:
```ts
this.connectionsByAgentId.set(agent.agent_id, ws);
```

In `handlePairRequest` success path (before `const response`), add:
```ts
this.connectionsByAgentId.set(agentId, ws);
```

In the `ws.on("close", ...)` block inside `handleConnection` (line ~260), add cleanup:
```ts
if (connState.agentId) this.connectionsByAgentId.delete(connState.agentId);
```

Add a new method after `sendCommand`:
```ts
/** Close a revoked agent's connection with a specific close code. */
revokeConnectedAgent(agentId: string): void {
  const ws = this.connectionsByAgentId.get(agentId);
  if (!ws) return;
  try {
    ws.send(JSON.stringify(createMessage("revoked", {})));
  } catch { /* ignore send errors on closing socket */ }
  ws.close(WS_CLOSE_CODE_REVOKED, "Agent revoked");
  this.connectionsByAgentId.delete(agentId);
}
```

- [ ] **Step 8.4: Handle `unpair_request` in `handleMessage`**

Still in `hub/src/server/server.ts`, inside the `switch (msg.type)` in `handleMessage` (line ~299), add a new case:
```ts
case "unpair_request": {
  if (!connState.agentId || !this.pairing) {
    ws.send(JSON.stringify(createMessage("unpair_response",
      { success: false, error: "Not authenticated" }, msg.id)));
    break;
  }
  const agentId = connState.agentId;
  this.pairing.revokeAgent(agentId);
  ws.send(JSON.stringify(createMessage("unpair_response", { success: true }, msg.id)));
  ws.close(WS_CLOSE_CODE_REVOKED, "Agent unpaired");
  this.connectionsByAgentId.delete(agentId);
  break;
}
```

- [ ] **Step 8.5: Wire hub-side revoke to call `revokeConnectedAgent`**

`PairingManager.revokeAgent` is called from the web `DELETE /api/pairing/agents/:id` route. We need that revoke to also trigger `AgentServer.revokeConnectedAgent(agentId)`.

In `hub/src/hub.ts`, right after constructing `this.agentServer` (line ~158) and before any usage, store a reference to it. Then augment the `PairingManager` callback passed in Task 5 so it ALSO invokes `agentServer.revokeConnectedAgent` — but `agentServer` isn't constructed yet when PairingManager is built.

Cleaner solution: add a separate `onRevoke` callback. Update PairingManager:

Edit `hub/src/server/pairing.ts`. Change constructor:
```ts
constructor(
  registryPath: string,
  private onChange?: (agents: PairedAgent[]) => void,
  private onRevoke?: (agentId: string) => void,
) {
  this.registryPath = registryPath;
  this.loadRegistry();
}
```

In `revokeAgent`, after splice + saveRegistry + log.info, add:
```ts
this.onRevoke?.(agentId);
```

Still emit `this.onChange?.(this.listAgents())` after `onRevoke`.

Then in `hub/src/hub.ts`, since the agentServer is constructed AFTER pairing manager, use a `let` binding and set the callback post-hoc. Rewrite the area around lines 144-158 to:

```ts
let agentServerRef: AgentServer | null = null;

if (this.opts.agentsRegistryPath) {
  this.pairing = new PairingManager(
    this.opts.agentsRegistryPath,
    (agents) => this.broadcaster.send({ type: "pairing:update", data: agents }),
    (agentId) => agentServerRef?.revokeConnectedAgent(agentId),
  );
}

const agentPort = this.opts.agentPort ?? 9210;
this.agentServer = new AgentServer({
  port: agentPort,
  registry,
  tls: this.opts.tls ? { cert: this.opts.tls.cert, key: this.opts.tls.key } : undefined,
  pairing: this.pairing ?? undefined,
  caCert: this.opts.tls?.caCert.toString(),
  caFingerprint: this.opts.tls?.caFingerprint,
  hubName: this.opts.hubName,
});
agentServerRef = this.agentServer;
```

- [ ] **Step 8.6: Run tests**

Run: `cd /opt/omnideck && pnpm --filter "./hub" test -- server.unpair pairing.onChange`
Expected: both suites pass.

- [ ] **Step 8.7: Commit**

```bash
cd /opt/omnideck && git add hub/src/server/server.ts hub/src/server/pairing.ts hub/src/hub.ts hub/src/server/__tests__/server.unpair.test.ts hub/src/server/__tests__/pairing.onChange.test.ts
git commit -m "feat(hub): handle unpair_request and notify agent on revoke"
```

---

## Task 9: Agent handles `revoked` and close code 4401

**Files:**
- Modify: `agent/src/ws/client.ts`
- Modify: `agent/src/agent.ts`

- [ ] **Step 9.1: Surface close code in `onDisconnected`**

In `agent/src/ws/client.ts`, change `onclose` callback (line ~158) from:
```ts
this.ws.onclose = () => {
  log.warn("Disconnected from hub");
  this.opts.onDisconnected?.(this.closing ? "shutdown" : "connection_lost");
  if (!this.closing) {
    this.scheduleReconnect();
  }
};
```
to:
```ts
this.ws.onclose = (event: CloseEvent) => {
  log.warn("Disconnected from hub", { code: event.code, reason: event.reason });
  if (event.code === WS_CLOSE_CODE_REVOKED) {
    this.opts.onDisconnected?.("revoked");
    // Do not reconnect — credentials are invalid
    return;
  }
  this.opts.onDisconnected?.(this.closing ? "shutdown" : "connection_lost");
  if (!this.closing) {
    this.scheduleReconnect();
  }
};
```

Add import at top:
```ts
import { WS_CLOSE_CODE_REVOKED } from "./protocol.js";
```

- [ ] **Step 9.2: Add `revoked` message handler in Agent**

In `agent/src/agent.ts`, inside the constructor after the auth-failure handler block (line ~141), add:
```ts
// Revoked handler — hub signalled that our token is no longer valid
this.client.onMessage("revoked", () => {
  log.warn("Hub revoked this agent");
  this.opts.onAuthFailed?.();
});
```

- [ ] **Step 9.3: Route "revoked" disconnect reason to onAuthFailed**

In `agent.ts` constructor, replace the existing `onDisconnected` wire-through (currently `onDisconnected: (reason) => opts.onDisconnected?.(reason)` on line ~97) with:
```ts
onDisconnected: (reason) => {
  if (reason === "revoked") {
    opts.onAuthFailed?.();
    return;
  }
  opts.onDisconnected?.(reason);
},
```

This covers the case where the close arrives before the `revoked` message.

- [ ] **Step 9.4: Commit**

```bash
cd /opt/omnideck && git add agent/src/ws/client.ts agent/src/agent.ts
git commit -m "feat(agent): treat revoked message and close 4401 as auth failure"
```

---

## Task 10: Agent `sendUnpairRequest` + stdin command

**Files:**
- Modify: `agent/src/agent.ts`
- Modify: `agent/src/index.ts`

- [ ] **Step 10.1: Expose `sendUnpairRequest` on Agent**

In `agent/src/agent.ts`, add a new method inside the `Agent` class (e.g. right after `stop()`):
```ts
/**
 * Request unpairing from the hub over the authenticated WebSocket.
 * Resolves when the hub acknowledges. Rejects on timeout (3s) or if
 * we are not currently connected.
 */
async requestUnpair(timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("unpair timeout"));
    }, timeoutMs);

    // One-shot handler
    this.client.onMessage("unpair_response", (msg) => {
      clearTimeout(timer);
      const data = msg.data as { success: boolean; error?: string };
      if (data.success) resolve();
      else reject(new Error(data.error ?? "unpair failed"));
    });

    try {
      this.client.send(createMessage("unpair_request", {}));
    } catch (err) {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
```

- [ ] **Step 10.2: Handle `unpair` command on stdin in managed mode**

In `agent/src/index.ts`, in the `startStdinListener` function, extend the JSON-parse block to handle a new `unpair` message type. Replace this block (currently around lines 100-112):
```ts
const msg = JSON.parse(line) as Record<string, unknown>;
if (msg.type === "platform_response" && typeof msg.id === "string") {
  const pending = pendingPlatformRequests.get(msg.id);
  if (pending) {
    pendingPlatformRequests.delete(msg.id);
    if (msg.error) {
      pending.reject(new Error(msg.error as string));
    } else {
      pending.resolve(msg.result);
    }
  }
}
```
with:
```ts
const msg = JSON.parse(line) as Record<string, unknown>;
if (msg.type === "platform_response" && typeof msg.id === "string") {
  const pending = pendingPlatformRequests.get(msg.id);
  if (pending) {
    pendingPlatformRequests.delete(msg.id);
    if (msg.error) {
      pending.reject(new Error(msg.error as string));
    } else {
      pending.resolve(msg.result);
    }
  }
} else if (msg.type === "unpair") {
  handleUnpairCommand();
}
```

Then define `handleUnpairCommand` near the top of the file (after imports). This needs access to the currently-running `Agent` instance. Refactor: hoist a module-level `currentAgent: Agent | null = null` variable, set it whenever we construct an Agent in `runManaged`, and reference it here.

Top of file, after imports:
```ts
let currentAgent: Agent | null = null;

function handleUnpairCommand(): void {
  const agent = currentAgent;
  if (!agent) {
    emit({ type: "unpaired", success: false, error: "not_connected" });
    return;
  }
  agent.requestUnpair()
    .then(() => {
      emit({ type: "unpaired", success: true });
      // Credentials deletion handled by the Tauri shell after receiving this.
    })
    .catch((err: unknown) => {
      emit({ type: "unpaired", success: false, error: String(err) });
    });
}
```

In `runManaged`, where each `new Agent(...)` is constructed (three places: discover-mode exits before this, pair mode at line ~216, normal mode at line ~259), assign `currentAgent = agent;` immediately after construction.

- [ ] **Step 10.3: Compile check**

Run: `cd /opt/omnideck && pnpm --filter "./agent" build`
Expected: build succeeds. (No new unit tests for this glue — it's exercised end-to-end in manual verification below.)

- [ ] **Step 10.4: Commit**

```bash
cd /opt/omnideck && git add agent/src/agent.ts agent/src/index.ts
git commit -m "feat(agent): unpair command over stdin IPC in managed mode"
```

---

## Task 11: Rewrite `cmd_unpair` to drive sidecar IPC

**Files:**
- Modify: `agent-app/src-tauri/src/sidecar.rs`
- Modify: `agent-app/src-tauri/src/lib.rs`

- [ ] **Step 11.1: Add `unpaired` message handling in sidecar.rs**

In `agent-app/src-tauri/src/sidecar.rs`, extend `handle_agent_message` (line ~116) to emit an app event when the sidecar acknowledges unpair. Add this case inside the `match msg_type` block, after `"auth_failed"`:
```rust
"unpaired" => {
    let _ = app.emit("agent-unpaired", msg);
}
```

- [ ] **Step 11.2: Rewrite `cmd_unpair`**

In `agent-app/src-tauri/src/lib.rs`, replace the entire `cmd_unpair` function (lines 139-154) with:
```rust
#[tauri::command]
async fn cmd_unpair(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Listener;
    use std::time::Duration;
    use tokio::time::timeout;

    let config_dir = get_config_dir();
    let creds_path = std::path::Path::new(&config_dir).join("credentials.json");

    // Ask the sidecar to notify the hub. Fire-and-forget with a 3-second deadline;
    // we clear local state regardless of the result.
    {
        let manager = app.state::<SidecarState>();

        // Set up a one-shot listener BEFORE sending so we don't miss the reply.
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        let tx_cell = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
        let tx_cell_cb = tx_cell.clone();
        let listener_id = app.once("agent-unpaired", move |_event| {
            if let Some(tx) = tx_cell_cb.lock().unwrap().take() {
                let _ = tx.send(());
            }
        });

        manager.0.write_to_child(&serde_json::json!({ "type": "unpair" }));

        // Wait up to 3 seconds; don't propagate timeout as an error.
        let _ = timeout(Duration::from_secs(3), rx).await;
        app.unlisten(listener_id);
    }

    // Stop the agent sidecar
    let manager = app.state::<SidecarState>();
    manager.0.stop();

    // Delete credentials
    if creds_path.exists() {
        std::fs::remove_file(&creds_path).map_err(|e| e.to_string())?;
    }

    // Update state + tray
    let _ = app.emit("agent-status", &AgentState::NotPaired);

    // Show pairing window so the user can re-pair
    show_pairing_window(&app);

    Ok(())
}
```

Note: `tokio` is already a transitive dep via `tauri`. If `cargo` complains about `tokio::sync::oneshot` not being available, add `tokio = { version = "1", features = ["sync", "time"] }` to `src-tauri/Cargo.toml` dependencies.

- [ ] **Step 11.3: Compile check**

Run: `cd /opt/omnideck/agent-app/src-tauri && cargo check`
Expected: builds without errors.

- [ ] **Step 11.4: Commit**

```bash
cd /opt/omnideck && git add agent-app/src-tauri/src/lib.rs agent-app/src-tauri/src/sidecar.rs agent-app/src-tauri/Cargo.toml
git commit -m "feat(agent-app): unpair over sidecar IPC, then clear creds"
```

---

## Task 12: Tray "Unpair Hub" menu item

**Files:**
- Modify: `agent-app/src-tauri/src/tray.rs`

- [ ] **Step 12.1: Add menu item + handler**

In `agent-app/src-tauri/src/tray.rs`:

Replace `build_menu` (line ~63) to add "Unpair Hub" after "Pair with Hub...":
```rust
let pair_item = MenuItem::with_id(app, "pair", "Pair with Hub...", !is_paired, None::<&str>)?;
let unpair_item = MenuItem::with_id(app, "unpair", "Unpair Hub...", is_paired, None::<&str>)?;
```

Update the `Menu::with_items` call to include `&unpair_item`:
```rust
Menu::with_items(app, &[
    &status_item,
    &separator1,
    &open_hub,
    &pair_item,
    &unpair_item,
    &separator2,
    &autostart_item,
    &about_item,
    &quit_item,
])
```

In `handle_menu_event` (line ~105), add a new match arm after `"pair"`:
```rust
"unpair" => {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let confirmed = tauri_plugin_dialog::MessageDialogBuilder::new(
            app_handle.dialog().clone(),
            "Unpair OmniDeck Agent",
            "This will remove this agent from the hub and delete local credentials. Continue?",
        )
        .kind(tauri_plugin_dialog::MessageDialogKind::Warning)
        .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
        .blocking_show();
        if confirmed {
            if let Err(e) = crate::cmd_unpair(app_handle.clone()).await {
                eprintln!("Unpair failed: {}", e);
            }
        }
    });
}
```

Make `cmd_unpair` visible to `tray.rs` — in `agent-app/src-tauri/src/lib.rs`, change its signature to `pub(crate) async fn cmd_unpair(...)`.

Also verify the dialog API — if `blocking_show` returns `bool` confirm the buttons enum name matches the installed `tauri_plugin_dialog` version. Run `cargo check` after editing.

- [ ] **Step 12.2: Compile check**

Run: `cd /opt/omnideck/agent-app/src-tauri && cargo check`
Expected: builds without errors.

- [ ] **Step 12.3: Manual end-to-end verification**

1. `cd /opt/omnideck/agent-app && pnpm tauri dev`
2. Pair the agent with the hub on angelica.local.
3. Confirm tray status shows "Connected to OmniDeck".
4. Click tray → "Unpair Hub..." → Confirm.
5. Verify:
   - Hub's Agents page drops the agent (live, without refresh — thanks to Task 6).
   - Tray state becomes "Not paired".
   - `~/Library/Application Support/OmniDeck/credentials.json` no longer exists.
   - Pairing window opens.
6. Re-pair. From the hub web UI, click "Revoke" on the agent.
7. Verify the running agent:
   - Tray state switches to "Not paired" shortly after.
   - `credentials.json` is deleted.
   - Pairing window appears.

- [ ] **Step 12.4: Commit**

```bash
cd /opt/omnideck && git add agent-app/src-tauri/src/tray.rs agent-app/src-tauri/src/lib.rs
git commit -m "feat(agent-app): tray 'Unpair Hub' menu item with confirmation"
```

---

## Task 13: Final verification

- [ ] **Step 13.1: Run full test suite**

```bash
cd /opt/omnideck && pnpm --filter "./hub" test && pnpm --filter "./agent" test && pnpm --filter "./agent-app" test
```
Expected: all tests pass, no regressions.

- [ ] **Step 13.2: Type-check**

```bash
cd /opt/omnideck && pnpm --filter "./hub" exec tsc --noEmit && pnpm --filter "./agent" exec tsc --noEmit && pnpm --filter "./agent-app" exec tsc --noEmit
```
Expected: clean type-check across all three packages.

- [ ] **Step 13.3: Smoke-test the full flow end to end on macOS**

On the Mac (angelica.local):
1. Fresh install of the rebuilt agent-app.
2. Confirm macOS local-network permission prompt appears on first launch.
3. Grant it; confirm hub is discovered.
4. Pair via dialog (no manual address needed).
5. Confirm Agents page updates live.
6. Unpair from tray — confirm both sides clear.
7. Re-pair, revoke from hub — confirm agent clears.
8. Enter `myhub.local` manually with hubs hidden (or on a different network) — confirm connection succeeds with auto-port.

---

## Summary of commits (in order)

1. `feat(agent-app): normalize manual hub address input`
2. `fix(agent-app): declare Bonjour service so mDNS works on macOS`
3. `feat(agent-app): retry scan and settings deep-link when no hubs found`
4. `feat(hub): PairingManager fires onChange on register/revoke`
5. `feat(hub): broadcast pairing:update on agent register/revoke`
6. `feat(web): live-refresh Agents page via pairing:update`
7. `feat(protocol): add unpair_request/response and revoke close code`
8. `feat(hub): handle unpair_request and notify agent on revoke`
9. `feat(agent): treat revoked message and close 4401 as auth failure`
10. `feat(agent): unpair command over stdin IPC in managed mode`
11. `feat(agent-app): unpair over sidecar IPC, then clear creds`
12. `feat(agent-app): tray 'Unpair Hub' menu item with confirmation`

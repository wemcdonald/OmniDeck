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
    const handler = (data: WebSocket.RawData) => {
      const msg = parseMessage(data.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off("message", handler);
        resolve(msg);
      }
    };
    ws.on("message", handler);
  });
}

describe("AgentServer unpair flow", () => {
  let dir: string;
  let pm: PairingManager;
  let server: AgentServer;
  let port: number;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "unpair-"));
    // Wire onRevoke through a ref — mirrors hub.ts so revokeAgent closes the socket.
    let serverRef: AgentServer | null = null;
    pm = new PairingManager(
      join(dir, "agents.yaml"),
      undefined,
      (agentId) => serverRef?.revokeConnectedAgent(agentId),
    );
    server = new AgentServer({ port: 0, pairing: pm });
    serverRef = server;
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
    const { ws } = await pairAndAuth();
    ws.send(JSON.stringify(createMessage("state_update", {
      hostname: "h", device_name: "H", platform: "linux", agent_version: "0.0.0",
    })));
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

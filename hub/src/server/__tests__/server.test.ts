import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { AgentServer } from "../server.js";
import { createMessage, parseMessage } from "../protocol.js";

describe("AgentServer", () => {
  let server: AgentServer;

  afterEach(async () => {
    if (server) await server.stop();
  });

  it("starts on a given port and accepts connections", async () => {
    server = new AgentServer({ port: 0 }); // random port
    const port = await server.start();
    expect(port).toBeGreaterThan(0);

    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));
    ws.close();
  });

  it("receives agent hello and tracks connected agents", async () => {
    server = new AgentServer({ port: 0 });
    const port = await server.start();

    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    // Send a state update (serves as hello)
    const msg = createMessage("state_update", {
      hostname: "test-mac",
      platform: "darwin",
      agent_version: "0.1.0",
    });
    ws.send(JSON.stringify(msg));

    await new Promise((r) => setTimeout(r, 100));
    expect(server.getConnectedAgents().length).toBe(1);
    ws.close();
  });

  it("sends command requests and receives responses", async () => {
    server = new AgentServer({ port: 0 });
    const port = await server.start();

    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    // Agent echoes back command responses
    ws.on("message", (data) => {
      const msg = parseMessage(data.toString());
      if (msg.type === "command") {
        const response = createMessage(
          "command_response",
          { success: true, result: "done" },
          msg.id,
        );
        ws.send(JSON.stringify(response));
      }
    });

    // Send hello first
    ws.send(
      JSON.stringify(
        createMessage("state_update", {
          hostname: "test-mac",
          platform: "darwin",
          agent_version: "0.1.0",
        }),
      ),
    );
    await new Promise((r) => setTimeout(r, 50));

    // Send command
    const result = await server.sendCommand("test-mac", "launch_app", { app: "Finder" });
    expect(result.success).toBe(true);
    ws.close();
  });
});

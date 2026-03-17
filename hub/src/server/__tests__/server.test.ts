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

  it("sends plugin manifest after agent hello", async () => {
    const mockRegistry = {
      getDistributionList: (platform: string) => [
        { id: "test-plugin", version: "1.0.0", sha256: "abc", platforms: [platform], hasAgent: true },
      ],
      getAgentBundle: (_id: string) => ({
        code: "export default function init() {}",
        sha256: "abc",
      }),
    };
    server = new AgentServer({ port: 0, registry: mockRegistry });
    const port = await server.start();

    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    const messages: any[] = [];
    ws.on("message", (data) => {
      messages.push(parseMessage(data.toString()));
    });

    // Send hello
    ws.send(JSON.stringify(createMessage("state_update", {
      hostname: "test-mac",
      platform: "darwin",
      agent_version: "0.2.0",
    })));

    await new Promise((r) => setTimeout(r, 200));

    const manifest = messages.find((m) => m.type === "plugin_manifest");
    expect(manifest).toBeDefined();
    expect(manifest.data.plugins).toHaveLength(1);
    expect(manifest.data.plugins[0].id).toBe("test-plugin");
    ws.close();
  });

  it("serves plugin bundle on download request", async () => {
    const mockRegistry = {
      getDistributionList: () => [],
      getAgentBundle: (_id: string) => ({
        code: "export default function init(o) { o.log.info('hello'); }",
        sha256: "def456",
      }),
    };
    server = new AgentServer({ port: 0, registry: mockRegistry });
    const port = await server.start();

    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    // Send hello first
    ws.send(JSON.stringify(createMessage("state_update", {
      hostname: "test-mac",
      platform: "darwin",
      agent_version: "0.2.0",
    })));
    await new Promise((r) => setTimeout(r, 100));

    const messages: any[] = [];
    ws.on("message", (data) => {
      messages.push(parseMessage(data.toString()));
    });

    // Request download
    ws.send(JSON.stringify(createMessage("plugin_download_request", { id: "my-plugin" }, "dl-1")));

    await new Promise((r) => setTimeout(r, 200));

    const response = messages.find((m) => m.type === "plugin_download_response");
    expect(response).toBeDefined();
    expect(response.data.id).toBe("my-plugin");
    expect(response.data.code).toContain("hello");
    expect(response.data.sha256).toBe("def456");
    ws.close();
  });
});

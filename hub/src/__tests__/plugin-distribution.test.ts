import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import WebSocket from "ws";
import { createMessage, parseMessage } from "../server/protocol.js";

// Mock the bundler so tests don't invoke esbuild
vi.mock("../plugins/bundler.js", () => ({
  bundleAgentPlugin: vi.fn().mockResolvedValue({
    code: "export default function init() {}",
    sha256: "abc123deadbeef",
  }),
}));

// Import after mocking so the registry picks up the mock
import { PluginRegistry } from "../plugins/registry.js";
import { AgentServer } from "../server/server.js";

describe("Plugin Distribution Integration", () => {
  let server: AgentServer;
  let tmpDir: string;

  afterEach(async () => {
    if (server) await server.stop();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("hub announces plugins to agent after state_update", async () => {
    // --- 1. Create a temp plugin directory with manifest + hub + agent ---
    tmpDir = mkdtempSync(join(tmpdir(), "omnideck-dist-test-"));
    const pluginDir = join(tmpDir, "test-plugin");
    mkdirSync(pluginDir);

    writeFileSync(
      join(pluginDir, "manifest.yaml"),
      [
        "id: test-plugin",
        "name: Test Plugin",
        "version: 1.0.0",
        "platforms:",
        "  - linux",
        "  - darwin",
        "  - windows",
        "hub: hub.ts",
        "agent: agent.ts",
      ].join("\n"),
    );

    writeFileSync(
      join(pluginDir, "hub.ts"),
      [
        "export default {",
        "  id: 'test-plugin',",
        "  name: 'Test Plugin',",
        "  version: '1.0.0',",
        "  async init() {},",
        "  async destroy() {},",
        "};",
      ].join("\n"),
    );

    writeFileSync(
      join(pluginDir, "agent.ts"),
      [
        "export default function init(omnideck: any) {",
        "  omnideck.onAction('greet', async (params: any) => ({",
        "    success: true,",
        "    result: 'hello ' + params.name,",
        "  }));",
        "}",
      ].join("\n"),
    );

    // --- 2. Load registry from the temp directory ---
    const registry = new PluginRegistry(tmpDir);
    await registry.loadAll();

    expect(registry.getManifests()).toHaveLength(1);
    expect(registry.getManifests()[0].id).toBe("test-plugin");

    // --- 3. Start AgentServer on a random port with the registry ---
    server = new AgentServer({ port: 0, registry });
    const port = await server.start();
    expect(port).toBeGreaterThan(0);

    // --- 4. Connect a raw WebSocket client ---
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });

    const messages: ReturnType<typeof parseMessage>[] = [];
    ws.on("message", (data) => {
      messages.push(parseMessage(data.toString()));
    });

    // --- 5. Send a state_update (agent hello) message ---
    ws.send(
      JSON.stringify(
        createMessage("state_update", {
          hostname: "test-agent",
          platform: "linux",
          agent_version: "0.2.0",
        }),
      ),
    );

    // --- 6. Wait for server to respond ---
    await new Promise((r) => setTimeout(r, 300));

    // --- 7. Assert the server sent back a plugin_manifest message ---
    const manifestMsg = messages.find((m) => m.type === "plugin_manifest");
    expect(manifestMsg).toBeDefined();

    // --- 8. Assert the plugin_manifest contains the test plugin ---
    const data = manifestMsg!.data as { plugins: Array<{ id: string }> };
    expect(data.plugins).toHaveLength(1);
    expect(data.plugins[0].id).toBe("test-plugin");

    ws.close();
  });
});

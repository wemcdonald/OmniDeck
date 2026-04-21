// agent/src/__tests__/multi-hub.test.ts
// Integration tests for the multi-hub fan-out behavior of Agent.
//
// We don't spin up real WebSockets. Instead we construct an Agent, then
// reach into its private state via a typed escape hatch to:
//  - inject synthetic HubConnections into the connection manager,
//  - populate hubPlugins so the fan-out filter has something to match on,
//  - stub the PluginLoader so we can observe unload calls without loading
//    actual plugin code.
//
// This mirrors the pattern used in ws/__tests__/hub-connection-manager.test.ts.

import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Agent } from "../agent.js";
import { createMessage, type WsMessage } from "../ws/protocol.js";
import type { HubConnection } from "../ws/hub-connection.js";
import type { HubConnectionManager } from "../ws/hub-connection-manager.js";
import type { PluginLoader } from "../plugins/loader.js";
import type { StateCache } from "../state-cache.js";

// ── Fake HubConnection ──────────────────────────────────────────────────────

class FakeHubConnection {
  sent: WsMessage[] = [];
  private _connected = true;
  constructor(public agentId: string, public hubName = agentId) {}

  send(msg: WsMessage): void {
    this.sent.push(msg);
  }
  close(): void {
    this._connected = false;
  }
  isConnected(): boolean {
    return this._connected;
  }
  markConnected(v: boolean): void {
    this._connected = v;
  }
  get credentials() {
    return {
      agent_id: this.agentId,
      token: "t",
      hub_address: "x",
      hub_name: this.hubName,
    };
  }
  get client() {
    return { onMessage: () => {} };
  }
}

// ── Fake PluginLoader ────────────────────────────────────────────────────────

class FakeLoader {
  loaded = new Set<string>();
  unloaded: string[] = [];
  hasCached() {
    return false;
  }
  getPlugin(id: string) {
    return this.loaded.has(id) ? { id } : undefined;
  }
  getLoadedPluginIds(): string[] {
    return [...this.loaded];
  }
  async unloadPlugin(id: string): Promise<void> {
    this.loaded.delete(id);
    this.unloaded.push(id);
  }
  async unloadAll(): Promise<void> {
    for (const id of [...this.loaded]) await this.unloadPlugin(id);
  }
}

// ── Harness ──────────────────────────────────────────────────────────────────

interface AgentInternals {
  manager: HubConnectionManager;
  loader: PluginLoader;
  hubPlugins: Map<string, Set<string>>;
  stateCache: StateCache;
  buildLoaderOptions: (deviceName: string) => {
    onStateUpdate?: (pluginId: string, key: string, value: unknown) => void;
    onLog?: (pluginId: string, level: string, msg: string, data?: unknown) => void;
    onActiveUpdate?: (pluginId: string, active: boolean, metadata?: unknown) => void;
  };
  replayStateCache: (conn: HubConnection) => void;
}

function buildAgent(): {
  agent: Agent;
  internals: AgentInternals;
  fakeLoader: FakeLoader;
} {
  const cacheDir = mkdtempSync(join(tmpdir(), "omnideck-multi-hub-test-"));
  const agent = new Agent({ cacheDir, credentialsList: [] });
  const internals = agent as unknown as AgentInternals;
  const fakeLoader = new FakeLoader();
  // Swap in our stub so plugin loading never hits disk or spawns workers.
  (internals as unknown as { loader: FakeLoader }).loader = fakeLoader;
  return { agent, internals, fakeLoader };
}

function inject(manager: HubConnectionManager, conn: FakeHubConnection): void {
  (manager as unknown as { hubs: Map<string, HubConnection> }).hubs.set(
    conn.agentId,
    conn as unknown as HubConnection,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("multi-hub Agent", () => {
  let agent: Agent;
  let internals: AgentInternals;
  let home: FakeHubConnection;
  let work: FakeHubConnection;
  let fakeLoader: FakeLoader;

  beforeEach(() => {
    const built = buildAgent();
    agent = built.agent;
    internals = built.internals;
    fakeLoader = built.fakeLoader;
    home = new FakeHubConnection("home");
    work = new FakeHubConnection("work");
    inject(internals.manager, home);
    inject(internals.manager, work);
  });

  it("plugin_state fan-out only reaches hubs that announced the plugin", () => {
    // home asked for plugin "lights"; work asked for plugin "music".
    internals.hubPlugins.set("home", new Set(["lights"]));
    internals.hubPlugins.set("work", new Set(["music"]));

    const loaderOpts = internals.buildLoaderOptions("test-host");
    loaderOpts.onStateUpdate?.("lights", "brightness", 80);

    expect(home.sent).toHaveLength(1);
    expect(home.sent[0].type).toBe("plugin_state");
    expect((home.sent[0].data as { pluginId: string }).pluginId).toBe("lights");
    expect(work.sent).toHaveLength(0);

    loaderOpts.onStateUpdate?.("music", "playing", true);
    expect(home.sent).toHaveLength(1);
    expect(work.sent).toHaveLength(1);
    expect((work.sent[0].data as { pluginId: string }).pluginId).toBe("music");
  });

  it("plugin_active and plugin_log respect the same per-hub filter", () => {
    internals.hubPlugins.set("home", new Set(["lights"]));
    internals.hubPlugins.set("work", new Set(["lights"]));

    const loaderOpts = internals.buildLoaderOptions("test-host");
    loaderOpts.onActiveUpdate?.("lights", true);
    loaderOpts.onLog?.("lights", "info", "hi");

    expect(home.sent.map((m) => m.type)).toEqual(["plugin_active", "plugin_log"]);
    expect(work.sent.map((m) => m.type)).toEqual(["plugin_active", "plugin_log"]);

    // A plugin neither hub wants produces no traffic.
    loaderOpts.onActiveUpdate?.("rogue", true);
    expect(home.sent).toHaveLength(2);
    expect(work.sent).toHaveLength(2);
  });

  it("replayStateCache only targets the connecting hub and only with wanted plugins", () => {
    internals.hubPlugins.set("home", new Set(["lights", "music"]));
    internals.hubPlugins.set("work", new Set(["lights"]));

    internals.stateCache.set("lights", "brightness", 50);
    internals.stateCache.set("music", "track", "song.mp3");
    internals.stateCache.set("rogue", "whatever", 1);

    internals.replayStateCache(home as unknown as HubConnection);

    // home wanted lights + music; rogue is filtered out.
    const homePluginIds = home.sent.map(
      (m) => (m.data as { pluginId: string }).pluginId,
    );
    expect(homePluginIds.sort()).toEqual(["lights", "music"]);
    // replay is per-hub; work gets nothing.
    expect(work.sent).toHaveLength(0);

    // Now replay to work — only lights, since that's all work wants.
    internals.replayStateCache(work as unknown as HubConnection);
    expect(work.sent.map((m) => (m.data as { pluginId: string }).pluginId)).toEqual(["lights"]);
  });

  it("forgetHub drops hubPlugins and unloads orphaned plugins", async () => {
    internals.hubPlugins.set("home", new Set(["lights", "music"]));
    internals.hubPlugins.set("work", new Set(["music"]));
    fakeLoader.loaded.add("lights");
    fakeLoader.loaded.add("music");

    await agent.forgetHub("home");

    expect(internals.hubPlugins.has("home")).toBe(false);
    // lights was only wanted by home → orphan → unload.
    expect(fakeLoader.unloaded).toContain("lights");
    // music is still wanted by work → keep loaded.
    expect(fakeLoader.unloaded).not.toContain("music");
    expect(fakeLoader.loaded.has("music")).toBe(true);
  });

  it("forgetHub of the last paired hub unloads every plugin", async () => {
    internals.hubPlugins.set("home", new Set(["lights"]));
    fakeLoader.loaded.add("lights");
    // Drop the unused work connection so forgetHub can't find anyone else.
    (internals.manager as unknown as { hubs: Map<string, HubConnection> }).hubs.delete("work");

    await agent.forgetHub("home");

    expect(internals.hubPlugins.size).toBe(0);
    expect(fakeLoader.unloaded).toContain("lights");
  });

  it("plugin_state fan-out skips hubs whose connection dropped", () => {
    internals.hubPlugins.set("home", new Set(["lights"]));
    internals.hubPlugins.set("work", new Set(["lights"]));
    work.markConnected(false);

    const loaderOpts = internals.buildLoaderOptions("test-host");
    loaderOpts.onStateUpdate?.("lights", "brightness", 80);

    expect(home.sent).toHaveLength(1);
    expect(work.sent).toHaveLength(0);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PluginHost } from "../host.js";
import { StateStore } from "../../state/store.js";
import type {
  OmniDeckPlugin,
  ActionDefinition,
  StateProviderDefinition,
  ButtonPreset,
} from "../types.js";

function createTestPlugin(overrides?: Partial<OmniDeckPlugin>): OmniDeckPlugin {
  return {
    id: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    init: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("PluginHost", () => {
  let host: PluginHost;
  let store: StateStore;

  beforeEach(() => {
    store = new StateStore();
    host = new PluginHost(store);
  });

  it("registers and initializes a plugin", async () => {
    const plugin = createTestPlugin();
    host.register(plugin);
    await host.initAll({});
    expect(plugin.init).toHaveBeenCalled();
  });

  it("provides plugin context with state store and logger", async () => {
    let receivedContext: unknown;
    const plugin = createTestPlugin({
      init: vi.fn(async (ctx) => {
        receivedContext = ctx;
      }),
    });
    host.register(plugin);
    await host.initAll({});
    expect(receivedContext).toHaveProperty("state");
    expect(receivedContext).toHaveProperty("log");
    expect(receivedContext).toHaveProperty("registerAction");
  });

  it("stores registered actions and looks them up", async () => {
    const action: ActionDefinition = {
      id: "toggle",
      name: "Toggle",
      execute: vi.fn(async () => {}),
    };
    const plugin = createTestPlugin({
      init: vi.fn(async (ctx) => {
        ctx.registerAction(action);
      }),
    });
    host.register(plugin);
    await host.initAll({});
    const found = host.getAction("test-plugin", "toggle");
    expect(found).toBeDefined();
    expect(found!.id).toBe("toggle");
  });

  it("stores registered state providers", async () => {
    const provider: StateProviderDefinition = {
      id: "entity_state",
      resolve: () => ({ label: "on" }),
    };
    const plugin = createTestPlugin({
      init: vi.fn(async (ctx) => {
        ctx.registerStateProvider(provider);
      }),
    });
    host.register(plugin);
    await host.initAll({});
    const found = host.getStateProvider("test-plugin", "entity_state");
    expect(found).toBeDefined();
  });

  it("stores registered presets", async () => {
    const preset: ButtonPreset = {
      id: "light_toggle",
      name: "Light Toggle",
      defaults: { action: "toggle", icon: "lightbulb" },
      mapParams: (p) => ({ actionParams: p, stateParams: p }),
    };
    const plugin = createTestPlugin({
      init: vi.fn(async (ctx) => {
        ctx.registerPreset(preset);
      }),
    });
    host.register(plugin);
    await host.initAll({});
    const found = host.getPreset("test-plugin", "light_toggle");
    expect(found).toBeDefined();
    expect(found!.name).toBe("Light Toggle");
  });

  it("destroys all plugins on shutdown", async () => {
    const plugin = createTestPlugin();
    host.register(plugin);
    await host.initAll({});
    await host.destroyAll();
    expect(plugin.destroy).toHaveBeenCalled();
  });
});

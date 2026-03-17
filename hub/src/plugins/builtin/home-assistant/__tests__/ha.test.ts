import { describe, it, expect, beforeEach } from "vitest";
import { PluginHost } from "../../../host.js";
import { StateStore } from "../../../../state/store.js";
import { homeAssistantPlugin } from "../index.js";

// We can't test real HA connection, but we can test registration and state providers
describe("home-assistant plugin", () => {
  let host: PluginHost;
  let store: StateStore;

  beforeEach(async () => {
    store = new StateStore();
    host = new PluginHost(store);
    host.register(homeAssistantPlugin);
    // Init without real HA connection (will log warning but not crash)
    await host.initAll({
      "home-assistant": { url: "ws://fake:8123", token: "fake" },
    });
  });

  it("registers toggle action", () => {
    expect(host.getAction("home-assistant", "toggle")).toBeDefined();
  });

  it("registers turn_on action", () => {
    expect(host.getAction("home-assistant", "turn_on")).toBeDefined();
  });

  it("registers turn_off action", () => {
    expect(host.getAction("home-assistant", "turn_off")).toBeDefined();
  });

  it("registers call_service action", () => {
    expect(host.getAction("home-assistant", "call_service")).toBeDefined();
  });

  it("registers entity_state state provider", () => {
    expect(host.getStateProvider("home-assistant", "entity_state")).toBeDefined();
  });

  it("registers light_toggle preset", () => {
    expect(host.getPreset("home-assistant", "light_toggle")).toBeDefined();
  });

  it("registers switch_toggle preset", () => {
    expect(host.getPreset("home-assistant", "switch_toggle")).toBeDefined();
  });

  it("registers scene_activate preset", () => {
    expect(host.getPreset("home-assistant", "scene_activate")).toBeDefined();
  });

  it("entity_state provider returns state from store", () => {
    // Simulate HA entity state being stored
    store.set("home-assistant", "entity:light.office", {
      state: "on",
      attributes: { brightness: 200 },
    });
    const provider = host.getStateProvider("home-assistant", "entity_state")!;
    const result = provider.resolve({ entity_id: "light.office" });
    expect(result.label).toBe("on");
  });
});

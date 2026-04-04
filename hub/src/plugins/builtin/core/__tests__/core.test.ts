import { describe, it, expect, beforeEach } from "vitest";
import { PluginHost } from "../../../host.js";
import { StateStore } from "../../../../state/store.js";
import { corePlugin } from "../index.js";

describe("omnideck-core plugin", () => {
  let host: PluginHost;
  let store: StateStore;

  beforeEach(async () => {
    store = new StateStore();
    host = new PluginHost(store);
    host.register(corePlugin);
    await host.initAll({});
  });

  it("registers change_page action", () => {
    expect(host.getAction("omnideck-core", "change_page")).toBeDefined();
  });

  it("registers go_back action", () => {
    expect(host.getAction("omnideck-core", "go_back")).toBeDefined();
  });

  it("registers set_brightness action", () => {
    expect(host.getAction("omnideck-core", "set_brightness")).toBeDefined();
  });

  it("registers reload_config action", () => {
    expect(host.getAction("omnideck-core", "reload_config")).toBeDefined();
  });

  it("change_page sets current_page in state", async () => {
    await host.executeAction("omnideck-core.change_page", { page: "media" });
    expect(store.get("omnideck-core", "current_page")).toBe("media");
  });

  it("go_back restores previous page", async () => {
    await host.executeAction("omnideck-core.change_page", { page: "home" });
    await host.executeAction("omnideck-core.change_page", { page: "media" });
    await host.executeAction("omnideck-core.go_back", {});
    expect(store.get("omnideck-core", "current_page")).toBe("home");
  });

  // ── core.mode state provider ────────────────────────────────────────

  it("registers mode state provider", () => {
    expect(host.getStateProvider("omnideck-core", "mode")).toBeDefined();
  });

  it("mode provider returns 'None' when no mode is active", () => {
    const result = host.resolveState("omnideck-core.mode", {});
    expect(result).toBeDefined();
    expect(result!.variables.active_mode).toBe("none");
    expect(result!.variables.active_mode_name).toBe("None");
    expect(result!.state.label).toBe("None");
    expect(result!.state.background).toBe("#000000");
  });

  it("mode provider reflects active mode from state store", () => {
    store.set("omnideck-core", "active_mode", "gaming");
    store.set("omnideck-core", "active_mode_name", "Gaming");
    store.set("omnideck-core", "active_mode_icon", "ms:sports_esports");

    const result = host.resolveState("omnideck-core.mode", {});
    expect(result).toBeDefined();
    expect(result!.variables.active_mode).toBe("gaming");
    expect(result!.variables.active_mode_name).toBe("Gaming");
    expect(result!.variables.active_mode_icon).toBe("ms:sports_esports");
    expect(result!.state.label).toBe("Gaming");
    expect(result!.state.background).toBe("#1e40af");
  });

  // ── core.all_agents_idle state provider ─────────────────────────────

  it("registers all_agents_idle state provider", () => {
    expect(host.getStateProvider("omnideck-core", "all_agents_idle")).toBeDefined();
  });

  it("all_agents_idle returns idle=true when no agents connected", () => {
    const result = host.resolveState("omnideck-core.all_agents_idle", {});
    expect(result).toBeDefined();
    expect(result!.variables.idle).toBe("true");
    expect(result!.variables.agent_count).toBe("0");
  });

  it("all_agents_idle returns idle=false when agents are active", () => {
    store.set("os-control", "agent:mac:state", { idle_time_ms: 1000 });
    store.set("os-control", "agent:mac:online", true);

    const result = host.resolveState("omnideck-core.all_agents_idle", {});
    expect(result).toBeDefined();
    expect(result!.variables.idle).toBe("false");
    expect(result!.variables.agent_count).toBe("1");
    expect(result!.variables.idle_count).toBe("0");
  });

  it("all_agents_idle returns idle=true when all agents are idle", () => {
    store.set("os-control", "agent:mac:state", { idle_time_ms: 600_000 });
    store.set("os-control", "agent:mac:online", true);
    store.set("os-control", "agent:win:state", { idle_time_ms: 400_000 });
    store.set("os-control", "agent:win:online", true);

    const result = host.resolveState("omnideck-core.all_agents_idle", {});
    expect(result).toBeDefined();
    expect(result!.variables.idle).toBe("true");
    expect(result!.variables.agent_count).toBe("2");
    expect(result!.variables.idle_count).toBe("2");
  });

  it("all_agents_idle ignores offline agents", () => {
    store.set("os-control", "agent:mac:state", { idle_time_ms: 1000 });
    store.set("os-control", "agent:mac:online", false);

    const result = host.resolveState("omnideck-core.all_agents_idle", {});
    expect(result).toBeDefined();
    expect(result!.variables.idle).toBe("true");
    expect(result!.variables.agent_count).toBe("0");
  });
});

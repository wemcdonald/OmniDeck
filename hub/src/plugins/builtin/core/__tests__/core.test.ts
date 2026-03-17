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
});

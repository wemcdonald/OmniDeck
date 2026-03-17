import { describe, it, expect, beforeEach } from "vitest";
import { PluginHost } from "../../../host.js";
import { StateStore } from "../../../../state/store.js";
import { osControlPlugin } from "../index.js";

describe("os-control plugin", () => {
  let host: PluginHost;
  let store: StateStore;

  beforeEach(async () => {
    store = new StateStore();
    host = new PluginHost(store);
    host.register(osControlPlugin);
    await host.initAll({ "os-control": { default_target: "auto" } });
  });

  it("registers launch_app action", () => {
    expect(host.getAction("os-control", "launch_app")).toBeDefined();
  });

  it("registers focus_app action", () => {
    expect(host.getAction("os-control", "focus_app")).toBeDefined();
  });

  it("registers send_keystroke action", () => {
    expect(host.getAction("os-control", "send_keystroke")).toBeDefined();
  });

  it("registers set_volume action", () => {
    expect(host.getAction("os-control", "set_volume")).toBeDefined();
  });

  it("registers active_window state provider", () => {
    expect(host.getStateProvider("os-control", "active_window")).toBeDefined();
  });

  it("registers volume_level state provider", () => {
    expect(host.getStateProvider("os-control", "volume_level")).toBeDefined();
  });

  it("registers app_running state provider", () => {
    expect(host.getStateProvider("os-control", "app_running")).toBeDefined();
  });

  it("registers app_launcher preset", () => {
    expect(host.getPreset("os-control", "app_launcher")).toBeDefined();
  });
});

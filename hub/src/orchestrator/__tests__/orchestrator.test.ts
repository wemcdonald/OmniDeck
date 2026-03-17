import { describe, it, expect, beforeEach, vi } from "vitest";
import { Orchestrator } from "../orchestrator.js";
import { StateStore } from "../../state/store.js";

function makeStore(): StateStore {
  return new StateStore();
}

function makeConfig(overrides: Partial<{
  switch_page_on_focus: boolean;
  device_pages: Record<string, string>;
}> = {}) {
  return {
    focus: {
      strategy: "idle_time" as const,
      idle_threshold_ms: 5000,
      switch_page_on_focus: overrides.switch_page_on_focus ?? true,
    },
    media: {
      strategy: "focused" as const,
    },
    device_pages: overrides.device_pages ?? { macbook: "mac-page", "windows-pc": "win-page" },
  };
}

describe("Orchestrator", () => {
  let store: StateStore;

  beforeEach(() => {
    store = makeStore();
  });

  it("initializes with focus tracker, presence manager, and media router", () => {
    const orch = new Orchestrator(makeConfig(), store);
    expect(orch.focusTracker).toBeDefined();
    expect(orch.presenceManager).toBeDefined();
    expect(orch.mediaRouter).toBeDefined();
  });

  it("updates focus tracker when agent state is received", () => {
    const orch = new Orchestrator(makeConfig(), store);
    orch.handleAgentState("macbook", { online: true, idleTimeMs: 100 });
    expect(orch.focusTracker.devices.has("macbook")).toBe(true);
    expect(orch.focusTracker.devices.get("macbook")?.online).toBe(true);
  });

  it("switches page on focus change when switch_page_on_focus is true", () => {
    const cfg = makeConfig({ switch_page_on_focus: true, device_pages: { macbook: "mac-page" } });
    const orch = new Orchestrator(cfg, store);
    orch.handleAgentState("macbook", { online: true, idleTimeMs: 100 });
    expect(store.get("omnideck-core", "current_page")).toBe("mac-page");
  });

  it("does NOT switch page when switch_page_on_focus is false", () => {
    const cfg = makeConfig({ switch_page_on_focus: false, device_pages: { macbook: "mac-page" } });
    const orch = new Orchestrator(cfg, store);
    orch.handleAgentState("macbook", { online: true, idleTimeMs: 100 });
    expect(store.get("omnideck-core", "current_page")).toBeUndefined();
  });

  it("does NOT switch page when focused device has no mapping in device_pages", () => {
    const cfg = makeConfig({ switch_page_on_focus: true, device_pages: {} });
    const orch = new Orchestrator(cfg, store);
    orch.handleAgentState("unknown-device", { online: true, idleTimeMs: 100 });
    expect(store.get("omnideck-core", "current_page")).toBeUndefined();
  });

  it("updates presence on agent connect", () => {
    const orch = new Orchestrator(makeConfig(), store);
    orch.handleAgentConnect("macbook");
    expect(orch.presenceManager.isOnline("macbook")).toBe(true);
  });

  it("updates presence on agent disconnect", () => {
    const orch = new Orchestrator(makeConfig(), store);
    orch.handleAgentConnect("macbook");
    orch.handleAgentDisconnect("macbook");
    expect(orch.presenceManager.isOnline("macbook")).toBe(false);
  });

  it("routes media commands via media router (focused strategy returns focused device)", () => {
    const cfg = makeConfig({ switch_page_on_focus: true });
    const orch = new Orchestrator(cfg, store);
    orch.handleAgentState("macbook", { online: true, idleTimeMs: 100 });
    expect(orch.getMediaTarget()).toBe("macbook");
  });

  it("returns hub as media target when no device is focused", () => {
    const cfg = makeConfig({ switch_page_on_focus: true });
    const orch = new Orchestrator(cfg, store);
    // No devices registered → no focus → hub fallback
    expect(orch.getMediaTarget()).toBe("hub");
  });

  it("exposes focused device", () => {
    const orch = new Orchestrator(makeConfig(), store);
    orch.handleAgentState("windows-pc", { online: true, idleTimeMs: 50 });
    expect(orch.focusedDevice).toBe("windows-pc");
  });
});

import { describe, it, expect } from "vitest";
import { isButtonAvailable, type AvailabilityContext } from "../availability.js";
import type { ButtonConfig } from "../../config/validator.js";

function makeCtx(overrides: Partial<AvailabilityContext> = {}): AvailabilityContext {
  const stateMap = new Map<string, unknown>();
  return {
    connectedAgents: new Set<string>(),
    state: {
      get: (pluginId: string, key: string) => stateMap.get(`${pluginId}:${key}`),
    },
    routingConfig: {},
    isAgentBackedPlugin: () => false,
    ...overrides,
  };
}

function btn(cfg: Partial<ButtonConfig> & { pos?: [number, number] } = {}): ButtonConfig {
  return { pos: [0, 0], ...cfg } as ButtonConfig;
}

describe("isButtonAvailable", () => {
  it("returns true for a button with no action or preset", () => {
    expect(isButtonAvailable(btn(), makeCtx())).toBe(true);
  });

  it("returns true when the button's plugin is hub-local (not agent-backed)", () => {
    const ctx = makeCtx({
      isAgentBackedPlugin: (id) => id === "sound",
      connectedAgents: new Set(),
    });
    expect(isButtonAvailable(btn({ action: "omnideck-core.switch_page" }), ctx)).toBe(true);
  });

  it("returns true for pinned-agent button when target is connected", () => {
    const ctx = makeCtx({
      isAgentBackedPlugin: () => true,
      connectedAgents: new Set(["macbook"]),
    });
    expect(isButtonAvailable(btn({ action: "sound.mute", target: "macbook" }), ctx)).toBe(true);
  });

  it("returns false for pinned-agent button when target is offline", () => {
    const ctx = makeCtx({
      isAgentBackedPlugin: () => true,
      connectedAgents: new Set(["windows"]),
    });
    expect(isButtonAvailable(btn({ action: "sound.mute", target: "macbook" }), ctx)).toBe(false);
  });

  it("returns true for capability-routed button when active_agent is online", () => {
    const stateMap = new Map<string, unknown>([["sound:active_agent", "macbook"]]);
    const ctx = makeCtx({
      isAgentBackedPlugin: () => true,
      connectedAgents: new Set(["macbook"]),
      state: { get: (p, k) => stateMap.get(`${p}:${k}`) },
    });
    expect(isButtonAvailable(btn({ action: "sound.mute" }), ctx)).toBe(true);
  });

  it("returns false for capability-routed button with no agent available", () => {
    const ctx = makeCtx({
      isAgentBackedPlugin: () => true,
      connectedAgents: new Set(),
    });
    expect(isButtonAvailable(btn({ action: "sound.mute" }), ctx)).toBe(false);
  });

  it("returns true when config agent_order has a connected fallback", () => {
    const ctx = makeCtx({
      isAgentBackedPlugin: () => true,
      connectedAgents: new Set(["mac-mini"]),
      routingConfig: { agent_order: ["macbook", "mac-mini"] },
    });
    expect(isButtonAvailable(btn({ action: "sound.mute" }), ctx)).toBe(true);
  });

  it("multi-action: returns true when any action is hub-local", () => {
    const ctx = makeCtx({
      isAgentBackedPlugin: (id) => id === "sound",
      connectedAgents: new Set(),
    });
    expect(
      isButtonAvailable(
        btn({ action: "sound.mute", long_press_action: "omnideck-core.switch_page" }),
        ctx,
      ),
    ).toBe(true);
  });

  it("multi-action: returns false when all actions agent-backed and no agent available", () => {
    const ctx = makeCtx({
      isAgentBackedPlugin: () => true,
      connectedAgents: new Set(),
    });
    expect(
      isButtonAvailable(
        btn({ action: "sound.mute", long_press_action: "os-control.focus_window" }),
        ctx,
      ),
    ).toBe(false);
  });

  it("preset-only button: uses preset prefix to identify plugin", () => {
    const ctx = makeCtx({
      isAgentBackedPlugin: () => true,
      connectedAgents: new Set(),
    });
    expect(isButtonAvailable(btn({ preset: "sound.volume_up" }), ctx)).toBe(false);
  });

  it("falls back to plugin default_target when resolveTarget finds nothing", () => {
    const ctx = makeCtx({
      isAgentBackedPlugin: () => true,
      connectedAgents: new Set(["Angelica"]),
      pluginDefaultTarget: (id) => (id === "sound" ? "Angelica" : undefined),
    });
    expect(isButtonAvailable(btn({ action: "sound.media_previous" }), ctx)).toBe(true);
  });

  it("does not use default_target when that agent is offline", () => {
    const ctx = makeCtx({
      isAgentBackedPlugin: () => true,
      connectedAgents: new Set(["Other"]),
      pluginDefaultTarget: () => "Angelica",
    });
    expect(isButtonAvailable(btn({ action: "sound.media_previous" }), ctx)).toBe(false);
  });

  it("pinned-agent + capability-routed sibling: pinned offline still makes button unavailable", () => {
    const stateMap = new Map<string, unknown>([["sound:active_agent", "windows"]]);
    const ctx = makeCtx({
      isAgentBackedPlugin: () => true,
      connectedAgents: new Set(["windows"]),
      state: { get: (p, k) => stateMap.get(`${p}:${k}`) },
    });
    // button.target pins all actions to "macbook", which is offline
    expect(
      isButtonAvailable(btn({ action: "sound.mute", target: "macbook" }), ctx),
    ).toBe(false);
  });
});

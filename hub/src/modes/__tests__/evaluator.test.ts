import { describe, it, expect } from "vitest";
import {
  compareValue,
  extractAttribute,
  evaluateCheck,
  evaluateRule,
  type ResolvedState,
  type StateResolver,
} from "../evaluator.js";
import type { ModeCheck, ModeRule } from "../types.js";

// ── compareValue ──────────────────────────────────────────────────────────

describe("compareValue", () => {
  const check = (overrides: Partial<ModeCheck>): ModeCheck => ({
    provider: "test",
    attribute: "x",
    ...overrides,
  });

  it("equals — string match", () => {
    expect(compareValue("on", check({ equals: "on" }))).toBe(true);
    expect(compareValue("off", check({ equals: "on" }))).toBe(false);
  });

  it("equals — numeric coercion", () => {
    expect(compareValue(42, check({ equals: "42" }))).toBe(true);
    expect(compareValue("42", check({ equals: 42 }))).toBe(true);
  });

  it("equals — boolean", () => {
    expect(compareValue(true, check({ equals: true }))).toBe(true);
    expect(compareValue(false, check({ equals: true }))).toBe(false);
  });

  it("not_equals", () => {
    expect(compareValue("on", check({ not_equals: "off" }))).toBe(true);
    expect(compareValue("on", check({ not_equals: "on" }))).toBe(false);
  });

  it("in — string list", () => {
    expect(compareValue("Steam", check({ in: ["Steam", "Epic"] }))).toBe(true);
    expect(compareValue("Chrome", check({ in: ["Steam", "Epic"] }))).toBe(false);
  });

  it("in — numeric coercion", () => {
    expect(compareValue("42", check({ in: [42, 43] }))).toBe(true);
  });

  it("not_in", () => {
    expect(compareValue("Chrome", check({ not_in: ["Steam", "Epic"] }))).toBe(true);
    expect(compareValue("Steam", check({ not_in: ["Steam", "Epic"] }))).toBe(false);
  });

  it("greater_than", () => {
    expect(compareValue(75, check({ greater_than: 50 }))).toBe(true);
    expect(compareValue(50, check({ greater_than: 50 }))).toBe(false);
    expect(compareValue("75", check({ greater_than: 50 }))).toBe(true);
  });

  it("less_than", () => {
    expect(compareValue(25, check({ less_than: 50 }))).toBe(true);
    expect(compareValue(50, check({ less_than: 50 }))).toBe(false);
  });

  it("contains", () => {
    expect(compareValue("Call of Duty", check({ contains: "Duty" }))).toBe(true);
    expect(compareValue("Fortnite", check({ contains: "Duty" }))).toBe(false);
    expect(compareValue(42, check({ contains: "4" }))).toBe(false); // non-string
  });

  it("matches — regex", () => {
    expect(compareValue("game_v2.exe", check({ matches: "game_v\\d+" }))).toBe(true);
    expect(compareValue("notepad.exe", check({ matches: "game_v\\d+" }))).toBe(false);
  });

  it("matches — invalid regex returns false", () => {
    expect(compareValue("test", check({ matches: "[invalid" }))).toBe(false);
  });

  it("no comparator returns false", () => {
    expect(compareValue("anything", check({}))).toBe(false);
  });
});

// ── extractAttribute ──────────────────────────────────────────────────────

describe("extractAttribute", () => {
  const resolved: ResolvedState = {
    state: { brightness: 80, icon: "ms:lightbulb" },
    variables: { brightness_percent: "80", state: "on" },
  };

  it("prefers variables over state", () => {
    expect(extractAttribute(resolved, "state")).toBe("on");
  });

  it("falls back to state object", () => {
    expect(extractAttribute(resolved, "brightness")).toBe(80);
    expect(extractAttribute(resolved, "icon")).toBe("ms:lightbulb");
  });

  it("returns undefined for missing attribute", () => {
    expect(extractAttribute(resolved, "nonexistent")).toBeUndefined();
  });
});

// ── evaluateCheck ─────────────────────────────────────────────────────────

describe("evaluateCheck", () => {
  const makeResolver = (data: Record<string, ResolvedState>): StateResolver => {
    return (qualifiedId) => data[qualifiedId];
  };

  it("resolves provider and checks attribute", () => {
    const resolve = makeResolver({
      "ha.entity": {
        state: {},
        variables: { state: "on" },
      },
    });
    const check: ModeCheck = {
      provider: "ha.entity",
      params: { entity_id: "light.office" },
      attribute: "state",
      equals: "on",
    };
    expect(evaluateCheck(check, resolve)).toBe(true);
  });

  it("returns false when provider not found", () => {
    const resolve = makeResolver({});
    const check: ModeCheck = {
      provider: "missing.provider",
      attribute: "state",
      equals: "on",
    };
    expect(evaluateCheck(check, resolve)).toBe(false);
  });

  it("returns false when attribute not found", () => {
    const resolve = makeResolver({
      "ha.entity": { state: {}, variables: {} },
    });
    const check: ModeCheck = {
      provider: "ha.entity",
      attribute: "missing",
      equals: "on",
    };
    expect(evaluateCheck(check, resolve)).toBe(false);
  });
});

// ── evaluateRule ──────────────────────────────────────────────────────────

describe("evaluateRule", () => {
  const resolve = (qualifiedId: string): ResolvedState | undefined => {
    if (qualifiedId === "os.active_window") {
      return { state: {}, variables: { app_name: "Steam" } };
    }
    if (qualifiedId === "ha.entity") {
      return { state: {}, variables: { state: "on" } };
    }
    return undefined;
  };

  it("AND rule — all checks must pass", () => {
    const rule: ModeRule = {
      condition: "and",
      checks: [
        { provider: "os.active_window", attribute: "app_name", equals: "Steam" },
        { provider: "ha.entity", attribute: "state", equals: "on" },
      ],
    };
    expect(evaluateRule(rule, resolve)).toBe(true);
  });

  it("AND rule — one failing check fails the rule", () => {
    const rule: ModeRule = {
      condition: "and",
      checks: [
        { provider: "os.active_window", attribute: "app_name", equals: "Steam" },
        { provider: "ha.entity", attribute: "state", equals: "off" },
      ],
    };
    expect(evaluateRule(rule, resolve)).toBe(false);
  });

  it("OR rule — any check passing is sufficient", () => {
    const rule: ModeRule = {
      condition: "or",
      checks: [
        { provider: "os.active_window", attribute: "app_name", equals: "Chrome" },
        { provider: "ha.entity", attribute: "state", equals: "on" },
      ],
    };
    expect(evaluateRule(rule, resolve)).toBe(true);
  });

  it("OR rule — all checks failing fails the rule", () => {
    const rule: ModeRule = {
      condition: "or",
      checks: [
        { provider: "os.active_window", attribute: "app_name", equals: "Chrome" },
        { provider: "ha.entity", attribute: "state", equals: "off" },
      ],
    };
    expect(evaluateRule(rule, resolve)).toBe(false);
  });

  it("empty checks returns false", () => {
    const rule: ModeRule = { condition: "and", checks: [] };
    expect(evaluateRule(rule, resolve)).toBe(false);
  });
});

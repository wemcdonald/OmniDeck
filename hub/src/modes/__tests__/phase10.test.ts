import { describe, it, expect, vi, beforeEach } from "vitest";
import { compareValue, evaluateCheck, debugCheck, type ResolvedState, type StateResolver } from "../evaluator.js";
import { ModeEngine, type ModeEngineDeps } from "../engine.js";
import type { ModeCheck, ModeDefinition } from "../types.js";
import { StateStore } from "../../state/store.js";

// ── NOT operator ──────────────────────────────────────────────────────

describe("NOT operator", () => {
  const check = (overrides: Partial<ModeCheck>): ModeCheck => ({
    provider: "test",
    attribute: "x",
    equals: "yes",
    ...overrides,
  });

  it("negates a passing check", () => {
    expect(compareValue("yes", check({ not: true }))).toBe(true); // compareValue ignores `not`
    // but evaluateCheck should negate
    const resolve: StateResolver = () => ({ state: {}, variables: { x: "yes" } });
    expect(evaluateCheck(check({ not: true }), resolve)).toBe(false);
  });

  it("negates a failing check to true", () => {
    const resolve: StateResolver = () => ({ state: {}, variables: { x: "no" } });
    expect(evaluateCheck(check({ not: true }), resolve)).toBe(true);
  });

  it("negated check with missing provider returns true", () => {
    const resolve: StateResolver = () => undefined;
    expect(evaluateCheck(check({ not: true }), resolve)).toBe(true);
  });

  it("non-negated check with missing provider returns false", () => {
    const resolve: StateResolver = () => undefined;
    expect(evaluateCheck(check({}), resolve)).toBe(false);
  });

  it("debugCheck shows negated info", () => {
    const resolve: StateResolver = () => ({ state: {}, variables: { x: "yes" } });
    const result = debugCheck(check({ not: true }), resolve);
    expect(result.negated).toBe(true);
    expect(result.comparator).toBe("NOT equals");
    expect(result.passes).toBe(false); // "yes" equals "yes" → true, negated → false
  });
});

// ── Manual mode override ──────────────────────────────────────────────

describe("Manual mode override", () => {
  function makeDeps(stateData: Record<string, ResolvedState | undefined> = {}): ModeEngineDeps {
    const store = new StateStore();
    return {
      store,
      resolveState: vi.fn((id: string) => stateData[id]),
      executeAction: vi.fn(async () => {}),
    };
  }

  const gamingMode: ModeDefinition = {
    id: "gaming",
    name: "Gaming",
    priority: 20,
    rules: [{ condition: "or", checks: [{ provider: "os.window", attribute: "app", in: ["Steam"] }] }],
  };

  const workingMode: ModeDefinition = {
    id: "working",
    name: "Working",
    priority: 30,
    rules: [{ condition: "or", checks: [{ provider: "os.window", attribute: "app", equals: "VS Code" }] }],
  };

  it("respects manual override over rule evaluation", () => {
    const deps = makeDeps({
      "os.window": { state: {}, variables: { app: "Steam" } },
    });
    deps.store.set("omnideck-core", "mode_override", "working");

    const engine = new ModeEngine([gamingMode, workingMode], deps);
    engine.start();

    // Gaming would normally match, but override forces working
    expect(engine.activeId).toBe("working");
  });

  it("resumes automatic mode when override cleared", () => {
    const deps = makeDeps({
      "os.window": { state: {}, variables: { app: "Steam" } },
    });
    deps.store.set("omnideck-core", "mode_override", "working");

    const engine = new ModeEngine([gamingMode, workingMode], deps);
    engine.start();
    expect(engine.activeId).toBe("working");

    // Clear override
    deps.store.set("omnideck-core", "mode_override", null);
    expect(engine.activeId).toBe("gaming");
  });

  it("override to nonexistent mode results in null", () => {
    const deps = makeDeps({});
    deps.store.set("omnideck-core", "mode_override", "nonexistent");

    const engine = new ModeEngine([gamingMode], deps);
    engine.start();
    expect(engine.activeId).toBeNull();
  });
});

// ── Mode history ──────────────────────────────────────────────────────

describe("Mode history", () => {
  it("records transitions in history", () => {
    const store = new StateStore();
    const deps: ModeEngineDeps = {
      store,
      resolveState: vi.fn(() => undefined),
      executeAction: vi.fn(async () => {}),
    };

    const mode: ModeDefinition = {
      id: "test",
      name: "Test",
      priority: 50,
      rules: [{ condition: "and", checks: [{ provider: "p", attribute: "a", equals: "1" }] }],
    };

    const engine = new ModeEngine([mode], deps);
    engine.start();
    expect(engine.history).toHaveLength(0); // no match, no change

    // Make it match
    (deps.resolveState as ReturnType<typeof vi.fn>).mockReturnValue({
      state: {}, variables: { a: "1" },
    });
    store.set("trigger", "x", 1);

    expect(engine.history).toHaveLength(1);
    expect(engine.history[0].from).toBeNull();
    expect(engine.history[0].to).toBe("test");
    expect(engine.history[0].timestamp).toBeDefined();

    // Deactivate
    (deps.resolveState as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    store.set("trigger", "x", 2);

    expect(engine.history).toHaveLength(2);
    expect(engine.history[0].from).toBe("test");
    expect(engine.history[0].to).toBeNull();
  });

  it("caps history at 50 entries", () => {
    const store = new StateStore();
    let shouldMatch = false;
    const deps: ModeEngineDeps = {
      store,
      resolveState: vi.fn(() =>
        shouldMatch ? { state: {}, variables: { a: "1" } } : undefined
      ),
      executeAction: vi.fn(async () => {}),
    };

    const mode: ModeDefinition = {
      id: "flip",
      name: "Flip",
      priority: 50,
      rules: [{ condition: "and", checks: [{ provider: "p", attribute: "a", equals: "1" }] }],
    };

    const engine = new ModeEngine([mode], deps);
    engine.start();

    // Toggle 60 times
    for (let i = 0; i < 60; i++) {
      shouldMatch = !shouldMatch;
      store.set("trigger", "x", i);
    }

    expect(engine.history.length).toBeLessThanOrEqual(50);
  });
});

// ── Nullable override fields (schema) ─────────────────────────────────

describe("Nullable override fields", () => {
  it("ButtonModeOverrideSchema accepts null values", async () => {
    const { ButtonConfigSchema } = await import("../../config/validator.js");
    const config = {
      pos: [0, 0],
      action: "ha.toggle",
      icon: "ms:lightbulb",
      modes: {
        gaming: {
          action: null,  // Clear action in gaming mode
          icon: null,    // Clear icon
          label: "Display only",
        },
      },
    };
    const result = ButtonConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.modes!.gaming.action).toBeNull();
      expect(result.data.modes!.gaming.icon).toBeNull();
    }
  });
});

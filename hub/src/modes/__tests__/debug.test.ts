import { describe, it, expect, vi } from "vitest";
import { debugCheck, debugRule, type ResolvedState, type StateResolver } from "../evaluator.js";
import { ModeEngine } from "../engine.js";
import { StateStore } from "../../state/store.js";
import type { ModeDefinition } from "../types.js";

const makeResolver = (data: Record<string, ResolvedState>): StateResolver =>
  (qualifiedId) => data[qualifiedId];

describe("debugCheck", () => {
  it("returns detailed info for a passing check", () => {
    const resolve = makeResolver({
      "ha.entity": { state: {}, variables: { state: "on" } },
    });

    const result = debugCheck(
      { provider: "ha.entity", attribute: "state", equals: "on" },
      resolve,
    );

    expect(result.passes).toBe(true);
    expect(result.providerFound).toBe(true);
    expect(result.actualValue).toBe("on");
    expect(result.comparator).toBe("equals");
    expect(result.expectedValue).toBe("on");
  });

  it("returns detailed info for a failing check", () => {
    const resolve = makeResolver({
      "ha.entity": { state: {}, variables: { state: "off" } },
    });

    const result = debugCheck(
      { provider: "ha.entity", attribute: "state", equals: "on" },
      resolve,
    );

    expect(result.passes).toBe(false);
    expect(result.actualValue).toBe("off");
    expect(result.expectedValue).toBe("on");
  });

  it("shows providerFound=false when provider missing", () => {
    const resolve = makeResolver({});

    const result = debugCheck(
      { provider: "missing.provider", attribute: "state", equals: "on" },
      resolve,
    );

    expect(result.passes).toBe(false);
    expect(result.providerFound).toBe(false);
    expect(result.actualValue).toBeUndefined();
  });

  it("handles in comparator", () => {
    const resolve = makeResolver({
      "os.window": { state: {}, variables: { app_name: "Steam" } },
    });

    const result = debugCheck(
      { provider: "os.window", attribute: "app_name", in: ["Steam", "Epic"] },
      resolve,
    );

    expect(result.passes).toBe(true);
    expect(result.comparator).toBe("in");
    expect(result.expectedValue).toEqual(["Steam", "Epic"]);
    expect(result.actualValue).toBe("Steam");
  });

  it("handles greater_than comparator", () => {
    const resolve = makeResolver({
      "sensor": { state: { brightness: 80 }, variables: {} },
    });

    const result = debugCheck(
      { provider: "sensor", attribute: "brightness", greater_than: 50 },
      resolve,
    );

    expect(result.passes).toBe(true);
    expect(result.comparator).toBe("greater_than");
    expect(result.expectedValue).toBe(50);
    expect(result.actualValue).toBe(80);
  });
});

describe("debugRule", () => {
  it("returns per-check results for AND rule", () => {
    const resolve = makeResolver({
      "ha.entity": { state: {}, variables: { state: "on" } },
      "os.window": { state: {}, variables: { app_name: "Chrome" } },
    });

    const result = debugRule(
      {
        condition: "and",
        checks: [
          { provider: "ha.entity", attribute: "state", equals: "on" },
          { provider: "os.window", attribute: "app_name", equals: "Steam" },
        ],
      },
      resolve,
    );

    expect(result.passes).toBe(false); // second check fails
    expect(result.checks).toHaveLength(2);
    expect(result.checks[0].passes).toBe(true);
    expect(result.checks[1].passes).toBe(false);
    expect(result.checks[1].actualValue).toBe("Chrome");
  });

  it("returns per-check results for OR rule", () => {
    const resolve = makeResolver({
      "ha.entity": { state: {}, variables: { state: "off" } },
      "os.window": { state: {}, variables: { app_name: "Steam" } },
    });

    const result = debugRule(
      {
        condition: "or",
        checks: [
          { provider: "ha.entity", attribute: "state", equals: "on" },
          { provider: "os.window", attribute: "app_name", equals: "Steam" },
        ],
      },
      resolve,
    );

    expect(result.passes).toBe(true); // second check passes
    expect(result.checks[0].passes).toBe(false);
    expect(result.checks[1].passes).toBe(true);
  });
});

describe("ModeEngine.debugEvaluate", () => {
  it("returns evaluation results for all modes", () => {
    const store = new StateStore();
    const engine = new ModeEngine(
      [
        {
          id: "gaming",
          name: "Gaming",
          priority: 20,
          rules: [
            {
              condition: "or",
              checks: [{ provider: "os.window", attribute: "app_name", in: ["Steam"] }],
            },
          ],
        },
        {
          id: "working",
          name: "Working",
          priority: 30,
          rules: [
            {
              condition: "or",
              checks: [{ provider: "os.window", attribute: "app_name", equals: "VS Code" }],
            },
          ],
        },
      ],
      {
        store,
        resolveState: (id) => {
          if (id === "os.window") {
            return { state: {}, variables: { app_name: "Steam" } };
          }
          return undefined;
        },
        executeAction: vi.fn(async () => {}),
      },
    );

    const results = engine.debugEvaluate();

    expect(results).toHaveLength(2);

    // Gaming should match
    expect(results[0].id).toBe("gaming");
    expect(results[0].active).toBe(true);
    expect(results[0].rules[0].passes).toBe(true);
    expect(results[0].rules[0].checks[0].passes).toBe(true);
    expect(results[0].rules[0].checks[0].actualValue).toBe("Steam");

    // Working should not match
    expect(results[1].id).toBe("working");
    expect(results[1].active).toBe(false);
    expect(results[1].rules[0].checks[0].passes).toBe(false);
    expect(results[1].rules[0].checks[0].actualValue).toBe("Steam");
  });
});

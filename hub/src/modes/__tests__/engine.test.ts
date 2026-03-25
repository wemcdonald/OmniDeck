import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModeEngine, type ModeEngineDeps } from "../engine.js";
import type { ModeDefinition } from "../types.js";
import type { ResolvedState } from "../evaluator.js";
import { StateStore } from "../../state/store.js";

function makeDeps(
  stateData: Record<string, ResolvedState | undefined> = {},
): ModeEngineDeps {
  const store = new StateStore();
  return {
    store,
    resolveState: vi.fn((qualifiedId: string) => stateData[qualifiedId]),
    executeAction: vi.fn(async () => {}),
  };
}

const gamingMode: ModeDefinition = {
  id: "gaming",
  name: "Gaming",
  icon: "ms:sports_esports",
  priority: 20,
  rules: [
    {
      condition: "or",
      checks: [
        {
          provider: "os-control.active_window",
          attribute: "app_name",
          in: ["Steam", "Call of Duty"],
        },
      ],
    },
  ],
  onEnter: [{ switch_page: "gaming" }],
  onExit: [{ switch_page: "home" }],
};

const workingMode: ModeDefinition = {
  id: "working",
  name: "Working",
  icon: "ms:code",
  priority: 30,
  rules: [
    {
      condition: "or",
      checks: [
        {
          provider: "os-control.active_window",
          attribute: "app_name",
          in: ["VS Code", "Cursor"],
        },
      ],
    },
  ],
  onEnter: [{ switch_page: "work" }],
};

const awayMode: ModeDefinition = {
  id: "away",
  name: "Away",
  priority: 90,
  rules: [
    {
      condition: "and",
      checks: [
        {
          provider: "omnideck-core.all_agents_idle",
          attribute: "idle",
          equals: true,
        },
      ],
    },
  ],
};

describe("ModeEngine", () => {
  it("starts with no active mode", () => {
    const deps = makeDeps();
    const engine = new ModeEngine([], deps);
    expect(engine.active).toBeNull();
    expect(engine.activeId).toBeNull();
  });

  it("evaluates modes on start and activates matching mode", () => {
    const deps = makeDeps({
      "os-control.active_window": {
        state: {},
        variables: { app_name: "Steam" },
      },
    });
    const engine = new ModeEngine([gamingMode, workingMode], deps);
    engine.start();
    expect(engine.activeId).toBe("gaming");
  });

  it("picks highest priority (lowest number) when multiple match", () => {
    const deps = makeDeps({
      "os-control.active_window": {
        state: {},
        variables: { app_name: "Steam" }, // matches gaming
      },
      "omnideck-core.all_agents_idle": {
        state: {},
        variables: { idle: "true" }, // matches away
      },
    });
    // away also has equals: true (boolean), but idle var is string "true"
    // Let's make away match by using string comparison
    const awayWithString: ModeDefinition = {
      ...awayMode,
      rules: [
        {
          condition: "and",
          checks: [
            {
              provider: "omnideck-core.all_agents_idle",
              attribute: "idle",
              equals: "true",
            },
          ],
        },
      ],
    };
    const engine = new ModeEngine([awayWithString, gamingMode], deps);
    engine.start();
    // Gaming has priority 20, away has 90 → gaming wins
    expect(engine.activeId).toBe("gaming");
  });

  it("activates null when no modes match", () => {
    const deps = makeDeps({
      "os-control.active_window": {
        state: {},
        variables: { app_name: "Chrome" },
      },
    });
    const engine = new ModeEngine([gamingMode, workingMode], deps);
    engine.start();
    expect(engine.activeId).toBeNull();
  });

  it("fires onModeChange callback when mode changes", () => {
    const deps = makeDeps({});
    const engine = new ModeEngine([gamingMode], deps);
    const cb = vi.fn();
    engine.onModeChange(cb);
    engine.start();

    // No match initially → null
    expect(cb).not.toHaveBeenCalled();

    // Simulate state change that makes gaming match
    (deps.resolveState as ReturnType<typeof vi.fn>).mockImplementation(
      (id: string) => {
        if (id === "os-control.active_window") {
          return { state: {}, variables: { app_name: "Steam" } };
        }
        return undefined;
      },
    );
    // Trigger via store change
    deps.store.set("os-control", "agent:mac:state", { app_name: "Steam" });

    expect(cb).toHaveBeenCalledWith(null, gamingMode);
    expect(engine.activeId).toBe("gaming");
  });

  it("fires on_enter and on_exit actions on mode transition", async () => {
    const deps = makeDeps({});
    const engine = new ModeEngine([gamingMode], deps);
    engine.start();

    // Activate gaming mode
    (deps.resolveState as ReturnType<typeof vi.fn>).mockImplementation(
      (id: string) => {
        if (id === "os-control.active_window") {
          return { state: {}, variables: { app_name: "Steam" } };
        }
        return undefined;
      },
    );
    deps.store.set("os-control", "trigger", 1);

    // Wait for async action firing
    await vi.waitFor(() => {
      expect(deps.executeAction).toHaveBeenCalledWith(
        "omnideck-core.change_page",
        { page: "gaming" },
      );
    });
  });

  it("fires on_exit when mode deactivates", async () => {
    const deps = makeDeps({
      "os-control.active_window": {
        state: {},
        variables: { app_name: "Steam" },
      },
    });
    const engine = new ModeEngine([gamingMode], deps);
    engine.start();
    expect(engine.activeId).toBe("gaming");

    // Now change so gaming no longer matches
    (deps.resolveState as ReturnType<typeof vi.fn>).mockImplementation(
      (id: string) => {
        if (id === "os-control.active_window") {
          return { state: {}, variables: { app_name: "Chrome" } };
        }
        return undefined;
      },
    );
    deps.store.set("os-control", "trigger", 2);

    await vi.waitFor(() => {
      // on_exit should trigger switch to "home"
      expect(deps.executeAction).toHaveBeenCalledWith(
        "omnideck-core.change_page",
        { page: "home" },
      );
    });
    expect(engine.activeId).toBeNull();
  });

  it("writes active_mode to StateStore", () => {
    const deps = makeDeps({
      "os-control.active_window": {
        state: {},
        variables: { app_name: "Steam" },
      },
    });
    const engine = new ModeEngine([gamingMode], deps);
    engine.start();

    expect(deps.store.get("omnideck-core", "active_mode")).toBe("gaming");
    expect(deps.store.get("omnideck-core", "active_mode_name")).toBe("Gaming");
    expect(deps.store.get("omnideck-core", "active_mode_icon")).toBe("ms:sports_esports");
  });

  it("clears active_mode when no mode matches", () => {
    const deps = makeDeps({
      "os-control.active_window": {
        state: {},
        variables: { app_name: "Steam" },
      },
    });
    const engine = new ModeEngine([gamingMode], deps);
    engine.start();
    expect(deps.store.get("omnideck-core", "active_mode")).toBe("gaming");

    // Remove match
    (deps.resolveState as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    deps.store.set("os-control", "trigger", 1);
    expect(deps.store.get("omnideck-core", "active_mode")).toBeNull();
  });

  it("does not evaluate when stopped", () => {
    const deps = makeDeps({
      "os-control.active_window": {
        state: {},
        variables: { app_name: "Steam" },
      },
    });
    const engine = new ModeEngine([gamingMode], deps);
    engine.start();
    expect(engine.activeId).toBe("gaming");

    engine.stop();

    // Change state — should not re-evaluate
    (deps.resolveState as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    deps.store.set("os-control", "trigger", 1);

    // Still gaming because engine is stopped
    expect(engine.activeId).toBe("gaming");
  });

  it("handles trigger_action in onEnter", async () => {
    const modeWithAction: ModeDefinition = {
      id: "test",
      name: "Test",
      priority: 10,
      rules: [
        {
          condition: "and",
          checks: [
            { provider: "test.provider", attribute: "active", equals: "true" },
          ],
        },
      ],
      onEnter: [
        {
          trigger_action: "home-assistant.scene_activate",
          params: { entity_id: "scene.gaming_lights" },
        },
      ],
    };

    const deps = makeDeps({
      "test.provider": { state: {}, variables: { active: "true" } },
    });
    const engine = new ModeEngine([modeWithAction], deps);
    engine.start();

    await vi.waitFor(() => {
      expect(deps.executeAction).toHaveBeenCalledWith(
        "home-assistant.scene_activate",
        { entity_id: "scene.gaming_lights" },
      );
    });
  });

  it("keeps current mode on tie priority (no flickering)", () => {
    const mode1: ModeDefinition = {
      id: "a",
      name: "A",
      priority: 50,
      rules: [
        {
          condition: "and",
          checks: [{ provider: "test", attribute: "x", equals: "1" }],
        },
      ],
    };
    const mode2: ModeDefinition = {
      id: "b",
      name: "B",
      priority: 50,
      rules: [
        {
          condition: "and",
          checks: [{ provider: "test", attribute: "y", equals: "1" }],
        },
      ],
    };

    // Both match — first by priority sort wins (stable sort by insertion order)
    const deps = makeDeps({
      test: { state: {}, variables: { x: "1", y: "1" } },
    });
    const engine = new ModeEngine([mode1, mode2], deps);
    engine.start();
    // One of them activates (deterministic based on sort stability)
    expect(engine.activeId).toBe("a");
  });
});

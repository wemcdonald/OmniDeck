import { describe, it, expect } from "vitest";
import { validateConfig, DeckConfigSchema, ButtonConfigSchema, PageConfigSchema } from "../validator.js";

describe("DeckConfigSchema", () => {
  it("validates a minimal deck config", () => {
    const result = DeckConfigSchema.safeParse({
      brightness: 80,
      default_page: "home",
    });
    expect(result.success).toBe(true);
  });

  it("rejects brightness out of range", () => {
    const result = DeckConfigSchema.safeParse({
      brightness: 150,
      default_page: "home",
    });
    expect(result.success).toBe(false);
  });

  it("applies defaults for optional fields", () => {
    const result = DeckConfigSchema.parse({ default_page: "home" });
    expect(result.brightness).toBe(100);
    expect(result.wake_on_touch).toBe(true);
  });
});

describe("ButtonConfigSchema", () => {
  it("validates a preset button", () => {
    const result = ButtonConfigSchema.safeParse({
      pos: [0, 0],
      preset: "home-assistant.light_toggle",
      params: { entity_id: "light.office" },
    });
    expect(result.success).toBe(true);
  });

  it("validates a custom button with action and state", () => {
    const result = ButtonConfigSchema.safeParse({
      pos: [1, 2],
      label: "Deploy",
      icon: "rocket",
      background: "#1a1a2e",
      action: "os-control.send_keystroke",
      params: { target: "macbook", keys: ["ctrl", "shift", "d"] },
      state: {
        provider: "home-assistant.entity_state",
        params: { entity_id: "light.office" },
        when_true: { background: "#16a34a", opacity: 1.0 },
        when_false: { background: "#dc2626", opacity: 0.5 },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects button without pos", () => {
    const result = ButtonConfigSchema.safeParse({ label: "no pos" });
    expect(result.success).toBe(false);
  });
});

describe("PageConfigSchema", () => {
  it("validates a page with buttons", () => {
    const result = PageConfigSchema.safeParse({
      page: "home",
      name: "Home",
      buttons: [{ pos: [0, 0], label: "Test" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("validateConfig", () => {
  it("validates a full config object", () => {
    const config = {
      deck: { brightness: 80, default_page: "home" },
      devices: [{ id: "macbook", platform: "darwin" }],
      plugins: {},
      orchestrator: {},
      pages: [
        {
          page: "home",
          name: "Home",
          buttons: [{ pos: [0, 0], label: "Test" }],
        },
      ],
    };
    const result = validateConfig(config);
    expect(result.deck.brightness).toBe(80);
  });
});

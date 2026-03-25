import { describe, it, expect } from "vitest";
import { ButtonConfigSchema, ModesConfigSchema } from "../../config/validator.js";

describe("Button mode overrides — schema validation", () => {
  it("accepts button config with mode overrides", () => {
    const config = {
      pos: [0, 0],
      action: "home-assistant.toggle",
      params: { entity_id: "light.office" },
      icon: "ms:lightbulb",
      label: "Office Light",
      modes: {
        gaming: {
          action: "sound.mute",
          params: { target: "gaming-pc" },
          icon: "ms:headset_off",
          label: "Mute Game",
          background: "#7c3aed",
        },
        working: {
          background: "#1e40af",
          icon_color: "#60a5fa",
        },
      },
    };

    const result = ButtonConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.modes).toBeDefined();
      expect(result.data.modes!.gaming.action).toBe("sound.mute");
      expect(result.data.modes!.gaming.icon).toBe("ms:headset_off");
      expect(result.data.modes!.working.background).toBe("#1e40af");
    }
  });

  it("accepts button config without mode overrides", () => {
    const config = {
      pos: [1, 2],
      action: "home-assistant.toggle",
    };

    const result = ButtonConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.modes).toBeUndefined();
    }
  });

  it("accepts empty modes object", () => {
    const config = {
      pos: [0, 0],
      modes: {},
    };

    const result = ButtonConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("validates mode override fields", () => {
    const config = {
      pos: [0, 0],
      modes: {
        gaming: {
          opacity: 1.5, // Out of range
        },
      },
    };

    const result = ButtonConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("mode override can include state provider", () => {
    const config = {
      pos: [0, 0],
      modes: {
        gaming: {
          state: {
            provider: "home-assistant.entity_state",
            params: { entity_id: "switch.gaming_pc" },
          },
        },
      },
    };

    const result = ButtonConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("mode override can include long_press overrides", () => {
    const config = {
      pos: [0, 0],
      modes: {
        gaming: {
          long_press_action: "sound.volume_up",
          long_press_params: { target: "gaming-pc" },
        },
      },
    };

    const result = ButtonConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

describe("Mode config schema validation", () => {
  it("rejects mode check with no comparator", () => {
    const config = {
      gaming: {
        name: "Gaming",
        rules: [
          {
            condition: "and",
            checks: [
              {
                provider: "os.window",
                attribute: "app_name",
                // No comparator!
              },
            ],
          },
        ],
      },
    };

    const result = ModesConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

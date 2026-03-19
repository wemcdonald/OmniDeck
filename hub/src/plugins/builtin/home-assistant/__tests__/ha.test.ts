import { describe, it, expect, beforeEach } from "vitest";
import { PluginHost } from "../../../host.js";
import { StateStore } from "../../../../state/store.js";
import { homeAssistantPlugin } from "../index.js";

// We can't test real HA connection, but we can test registration and state providers
describe("home-assistant plugin", () => {
  let host: PluginHost;
  let store: StateStore;

  beforeEach(async () => {
    store = new StateStore();
    host = new PluginHost(store);
    host.register(homeAssistantPlugin);
    // Init without real HA connection — will log warning but not crash
    await host.initAll({
      "home-assistant": { url: "", token: "" },
    });
  });

  // -- Actions --

  it("registers toggle action", () => {
    expect(host.getAction("home-assistant", "toggle")).toBeDefined();
  });

  it("registers turn_on action", () => {
    expect(host.getAction("home-assistant", "turn_on")).toBeDefined();
  });

  it("registers turn_off action", () => {
    expect(host.getAction("home-assistant", "turn_off")).toBeDefined();
  });

  it("registers call_service action", () => {
    expect(host.getAction("home-assistant", "call_service")).toBeDefined();
  });

  it("registers run_scene action", () => {
    expect(host.getAction("home-assistant", "run_scene")).toBeDefined();
  });

  it("registers run_script action", () => {
    expect(host.getAction("home-assistant", "run_script")).toBeDefined();
  });

  it("registers set_climate action", () => {
    expect(host.getAction("home-assistant", "set_climate")).toBeDefined();
  });

  it("registers set_cover action", () => {
    expect(host.getAction("home-assistant", "set_cover")).toBeDefined();
  });

  it("registers lock action", () => {
    expect(host.getAction("home-assistant", "lock")).toBeDefined();
  });

  it("registers unlock action", () => {
    expect(host.getAction("home-assistant", "unlock")).toBeDefined();
  });

  it("registers toggle_lock action", () => {
    expect(host.getAction("home-assistant", "toggle_lock")).toBeDefined();
  });

  it("registers media_play_pause action", () => {
    expect(host.getAction("home-assistant", "media_play_pause")).toBeDefined();
  });

  it("registers fire_event action", () => {
    expect(host.getAction("home-assistant", "fire_event")).toBeDefined();
  });

  it("registers set_input action", () => {
    expect(host.getAction("home-assistant", "set_input")).toBeDefined();
  });

  it("registers set_fan_speed action", () => {
    expect(host.getAction("home-assistant", "set_fan_speed")).toBeDefined();
  });

  // -- State Providers --

  it("registers entity_state provider", () => {
    expect(host.getStateProvider("home-assistant", "entity_state")).toBeDefined();
  });

  it("registers light_state provider", () => {
    expect(host.getStateProvider("home-assistant", "light_state")).toBeDefined();
  });

  it("registers climate_state provider", () => {
    expect(host.getStateProvider("home-assistant", "climate_state")).toBeDefined();
  });

  it("registers media_player_state provider", () => {
    expect(host.getStateProvider("home-assistant", "media_player_state")).toBeDefined();
  });

  it("registers sensor_value provider", () => {
    expect(host.getStateProvider("home-assistant", "sensor_value")).toBeDefined();
  });

  it("registers cover_state provider", () => {
    expect(host.getStateProvider("home-assistant", "cover_state")).toBeDefined();
  });

  it("registers lock_state provider", () => {
    expect(host.getStateProvider("home-assistant", "lock_state")).toBeDefined();
  });

  it("registers fan_state provider", () => {
    expect(host.getStateProvider("home-assistant", "fan_state")).toBeDefined();
  });

  // -- Presets --

  it("registers light preset", () => {
    expect(host.getPreset("home-assistant", "light")).toBeDefined();
  });

  it("registers toggle preset", () => {
    expect(host.getPreset("home-assistant", "toggle")).toBeDefined();
  });

  it("registers scene preset", () => {
    expect(host.getPreset("home-assistant", "scene")).toBeDefined();
  });

  it("registers script preset", () => {
    expect(host.getPreset("home-assistant", "script")).toBeDefined();
  });

  it("registers climate preset", () => {
    expect(host.getPreset("home-assistant", "climate")).toBeDefined();
  });

  it("registers cover preset", () => {
    expect(host.getPreset("home-assistant", "cover")).toBeDefined();
  });

  it("registers sensor preset", () => {
    expect(host.getPreset("home-assistant", "sensor")).toBeDefined();
  });

  it("registers lock preset", () => {
    expect(host.getPreset("home-assistant", "lock")).toBeDefined();
  });

  it("registers fan preset", () => {
    expect(host.getPreset("home-assistant", "fan")).toBeDefined();
  });

  it("registers media_player preset", () => {
    expect(host.getPreset("home-assistant", "media_player")).toBeDefined();
  });

  // Legacy compat presets
  it("registers light_toggle preset (compat)", () => {
    expect(host.getPreset("home-assistant", "light_toggle")).toBeDefined();
  });

  it("registers switch_toggle preset (compat)", () => {
    expect(host.getPreset("home-assistant", "switch_toggle")).toBeDefined();
  });

  it("registers scene_activate preset (compat)", () => {
    expect(host.getPreset("home-assistant", "scene_activate")).toBeDefined();
  });

  // -- State provider resolution --

  describe("entity_state provider", () => {
    it("returns loading state when entity not in store", () => {
      const provider = host.getStateProvider("home-assistant", "entity_state")!;
      const result = provider.resolve({ entity_id: "light.nonexistent" });
      expect(result.state.label).toBe("...");
      expect(result.state.opacity).toBe(0.4);
    });

    it("returns state for a light entity", () => {
      store.set("home-assistant", "entity:light.office", {
        state: "on",
        attributes: { brightness: 200, friendly_name: "Office Light" },
      });
      const provider = host.getStateProvider("home-assistant", "entity_state")!;
      const result = provider.resolve({ entity_id: "light.office" });
      expect(result.state.label).toBe("on");
      expect(result.state.background).toBe("#92400e");
      expect(result.state.topLabel).toBe("Office Light");
    });

    it("returns dim state for off entity", () => {
      store.set("home-assistant", "entity:switch.desk_fan", {
        state: "off",
        attributes: {},
      });
      const provider = host.getStateProvider("home-assistant", "entity_state")!;
      const result = provider.resolve({ entity_id: "switch.desk_fan" });
      expect(result.state.label).toBe("off");
      expect(result.state.opacity).toBe(0.7);
      expect(result.state.background).toBe("#374151");
    });
  });

  describe("light_state provider", () => {
    it("shows brightness percentage and progress", () => {
      store.set("home-assistant", "entity:light.desk", {
        state: "on",
        attributes: { brightness: 127 },
      });
      const provider = host.getStateProvider("home-assistant", "light_state")!;
      const result = provider.resolve({ entity_id: "light.desk" });
      expect(result.state.label).toBe("50%");
      expect(result.state.progress).toBeCloseTo(0.5, 1);
    });

    it("shows off state dimmed", () => {
      store.set("home-assistant", "entity:light.desk", {
        state: "off",
        attributes: {},
      });
      const provider = host.getStateProvider("home-assistant", "light_state")!;
      const result = provider.resolve({ entity_id: "light.desk" });
      expect(result.state.label).toBe("Off");
      expect(result.state.opacity).toBe(0.6);
    });

    it("uses RGB color for background when available", () => {
      store.set("home-assistant", "entity:light.strip", {
        state: "on",
        attributes: { brightness: 255, rgb_color: [255, 0, 128] },
      });
      const provider = host.getStateProvider("home-assistant", "light_state")!;
      const result = provider.resolve({ entity_id: "light.strip" });
      expect(result.state.background).toBe("#ff0080");
    });
  });

  describe("climate_state provider", () => {
    it("shows current and target temp", () => {
      store.set("home-assistant", "entity:climate.living_room", {
        state: "heat",
        attributes: {
          current_temperature: 21,
          temperature: 23,
          unit_of_measurement: "°C",
        },
      });
      const provider = host.getStateProvider("home-assistant", "climate_state")!;
      const result = provider.resolve({ entity_id: "climate.living_room" });
      expect(result.state.label).toBe("21°C");
      expect(result.state.topLabel).toBe("→ 23°C");
    });

    it("colors by hvac action", () => {
      store.set("home-assistant", "entity:climate.bedroom", {
        state: "cool",
        attributes: { current_temperature: 26, hvac_action: "cooling" },
      });
      const provider = host.getStateProvider("home-assistant", "climate_state")!;
      const result = provider.resolve({ entity_id: "climate.bedroom" });
      expect(result.state.background).toBe("#0369a1");
    });
  });

  describe("sensor_value provider", () => {
    it("shows value with unit", () => {
      store.set("home-assistant", "entity:sensor.outdoor_temp", {
        state: "18.5",
        attributes: {
          unit_of_measurement: "°C",
          device_class: "temperature",
        },
      });
      const provider = host.getStateProvider("home-assistant", "sensor_value")!;
      const result = provider.resolve({ entity_id: "sensor.outdoor_temp" });
      expect(result.state.label).toBe("18.5 °C");
      expect(result.state.icon).toBe("ms:thermostat");
    });

    it("shows battery with progress bar", () => {
      store.set("home-assistant", "entity:sensor.phone_battery", {
        state: "15",
        attributes: {
          unit_of_measurement: "%",
          device_class: "battery",
        },
      });
      const provider = host.getStateProvider("home-assistant", "sensor_value")!;
      const result = provider.resolve({ entity_id: "sensor.phone_battery" });
      expect(result.state.progress).toBeCloseTo(0.15, 2);
      expect(result.state.badgeColor).toBe("#ef4444");
    });
  });

  describe("cover_state provider", () => {
    it("shows position as progress bar", () => {
      store.set("home-assistant", "entity:cover.blinds", {
        state: "open",
        attributes: { current_position: 75 },
      });
      const provider = host.getStateProvider("home-assistant", "cover_state")!;
      const result = provider.resolve({ entity_id: "cover.blinds" });
      expect(result.state.label).toBe("75%");
      expect(result.state.progress).toBeCloseTo(0.75, 2);
    });

    it("dims when closed", () => {
      store.set("home-assistant", "entity:cover.garage", {
        state: "closed",
        attributes: { device_class: "garage" },
      });
      const provider = host.getStateProvider("home-assistant", "cover_state")!;
      const result = provider.resolve({ entity_id: "cover.garage" });
      expect(result.state.icon).toBe("ms:garage");
      expect(result.state.opacity).toBe(0.7);
    });
  });

  describe("lock_state provider", () => {
    it("shows locked state in red", () => {
      store.set("home-assistant", "entity:lock.front_door", {
        state: "locked",
        attributes: {},
      });
      const provider = host.getStateProvider("home-assistant", "lock_state")!;
      const result = provider.resolve({ entity_id: "lock.front_door" });
      expect(result.state.icon).toBe("ms:lock");
      expect(result.state.background).toBe("#991b1b");
      expect(result.state.label).toBe("Locked");
    });

    it("shows unlocked state in green", () => {
      store.set("home-assistant", "entity:lock.front_door", {
        state: "unlocked",
        attributes: {},
      });
      const provider = host.getStateProvider("home-assistant", "lock_state")!;
      const result = provider.resolve({ entity_id: "lock.front_door" });
      expect(result.state.icon).toBe("ms:lock-open");
      expect(result.state.background).toBe("#065f46");
    });
  });

  describe("fan_state provider", () => {
    it("shows speed percentage when on", () => {
      store.set("home-assistant", "entity:fan.bedroom", {
        state: "on",
        attributes: { percentage: 66 },
      });
      const provider = host.getStateProvider("home-assistant", "fan_state")!;
      const result = provider.resolve({ entity_id: "fan.bedroom" });
      expect(result.state.label).toBe("66%");
      expect(result.state.progress).toBeCloseTo(0.66, 2);
    });
  });

  describe("media_player_state provider", () => {
    it("shows playing state with track info", () => {
      store.set("home-assistant", "entity:media_player.tv", {
        state: "playing",
        attributes: {
          media_title: "The Office S03E01",
          app_name: "Plex",
        },
      });
      const provider = host.getStateProvider("home-assistant", "media_player_state")!;
      const result = provider.resolve({ entity_id: "media_player.tv" });
      expect(result.state.label).toBe("The Office S03E01");
      expect(result.state.topLabel).toBe("Plex");
      expect(result.state.icon).toBe("ms:pause-circle");
    });
  });

  // -- Preset structure --

  describe("preset structure", () => {
    it("light preset references action and stateProvider", () => {
      const preset = host.getPreset("home-assistant", "light")!;
      expect(preset.action).toBe("toggle");
      expect(preset.stateProvider).toBe("light_state");
      expect(preset.defaults).toBeDefined();
    });

    it("scene preset references run_scene action with no stateProvider", () => {
      const preset = host.getPreset("home-assistant", "scene")!;
      expect(preset.action).toBe("run_scene");
      expect(preset.stateProvider).toBeUndefined();
      expect(preset.defaults).toBeDefined();
    });

    it("climate preset references set_climate action and climate_state provider", () => {
      const preset = host.getPreset("home-assistant", "climate")!;
      expect(preset.action).toBe("set_climate");
      expect(preset.stateProvider).toBe("climate_state");
      expect(preset.defaults).toBeDefined();
    });

    it("sensor preset is read-only (no action, only stateProvider)", () => {
      const preset = host.getPreset("home-assistant", "sensor")!;
      expect(preset.action).toBeUndefined();
      expect(preset.stateProvider).toBe("sensor_value");
      expect(preset.defaults).toBeDefined();
    });
  });
});

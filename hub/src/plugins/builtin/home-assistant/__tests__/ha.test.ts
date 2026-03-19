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
      expect(result.label).toBe("...");
      expect(result.opacity).toBe(0.4);
    });

    it("returns state for a light entity", () => {
      store.set("home-assistant", "entity:light.office", {
        state: "on",
        attributes: { brightness: 200, friendly_name: "Office Light" },
      });
      const provider = host.getStateProvider("home-assistant", "entity_state")!;
      const result = provider.resolve({ entity_id: "light.office" });
      expect(result.label).toBe("on");
      expect(result.background).toBe("#92400e");
      expect(result.topLabel).toBe("Office Light");
    });

    it("returns dim state for off entity", () => {
      store.set("home-assistant", "entity:switch.desk_fan", {
        state: "off",
        attributes: {},
      });
      const provider = host.getStateProvider("home-assistant", "entity_state")!;
      const result = provider.resolve({ entity_id: "switch.desk_fan" });
      expect(result.label).toBe("off");
      expect(result.opacity).toBe(0.7);
      expect(result.background).toBe("#374151");
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
      expect(result.label).toBe("50%");
      expect(result.progress).toBeCloseTo(0.5, 1);
    });

    it("shows off state dimmed", () => {
      store.set("home-assistant", "entity:light.desk", {
        state: "off",
        attributes: {},
      });
      const provider = host.getStateProvider("home-assistant", "light_state")!;
      const result = provider.resolve({ entity_id: "light.desk" });
      expect(result.label).toBe("Off");
      expect(result.opacity).toBe(0.6);
    });

    it("uses RGB color for background when available", () => {
      store.set("home-assistant", "entity:light.strip", {
        state: "on",
        attributes: { brightness: 255, rgb_color: [255, 0, 128] },
      });
      const provider = host.getStateProvider("home-assistant", "light_state")!;
      const result = provider.resolve({ entity_id: "light.strip" });
      expect(result.background).toBe("#ff0080");
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
      expect(result.label).toBe("21°C");
      expect(result.topLabel).toBe("→ 23°C");
    });

    it("colors by hvac action", () => {
      store.set("home-assistant", "entity:climate.bedroom", {
        state: "cool",
        attributes: { current_temperature: 26, hvac_action: "cooling" },
      });
      const provider = host.getStateProvider("home-assistant", "climate_state")!;
      const result = provider.resolve({ entity_id: "climate.bedroom" });
      expect(result.background).toBe("#0369a1");
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
      expect(result.label).toBe("18.5 °C");
      expect(result.icon).toBe("mdi:thermometer");
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
      expect(result.progress).toBeCloseTo(0.15, 2);
      expect(result.badgeColor).toBe("#ef4444");
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
      expect(result.label).toBe("75%");
      expect(result.progress).toBeCloseTo(0.75, 2);
    });

    it("dims when closed", () => {
      store.set("home-assistant", "entity:cover.garage", {
        state: "closed",
        attributes: { device_class: "garage" },
      });
      const provider = host.getStateProvider("home-assistant", "cover_state")!;
      const result = provider.resolve({ entity_id: "cover.garage" });
      expect(result.icon).toBe("mdi:garage");
      expect(result.opacity).toBe(0.7);
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
      expect(result.icon).toBe("mdi:lock");
      expect(result.background).toBe("#991b1b");
      expect(result.label).toBe("Locked");
    });

    it("shows unlocked state in green", () => {
      store.set("home-assistant", "entity:lock.front_door", {
        state: "unlocked",
        attributes: {},
      });
      const provider = host.getStateProvider("home-assistant", "lock_state")!;
      const result = provider.resolve({ entity_id: "lock.front_door" });
      expect(result.icon).toBe("mdi:lock-open");
      expect(result.background).toBe("#065f46");
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
      expect(result.label).toBe("66%");
      expect(result.progress).toBeCloseTo(0.66, 2);
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
      expect(result.label).toBe("The Office S03E01");
      expect(result.topLabel).toBe("Plex");
      expect(result.icon).toBe("mdi:pause-circle");
    });
  });

  // -- Preset mapping --

  describe("preset mapping", () => {
    it("light preset maps entity_id to both action and state params", () => {
      const preset = host.getPreset("home-assistant", "light")!;
      const mapped = preset.mapParams({ entity_id: "light.office" });
      expect(mapped.actionParams).toEqual({ entity_id: "light.office" });
      expect(mapped.stateParams).toEqual({ entity_id: "light.office" });
    });

    it("scene preset maps scene_id to action params", () => {
      const preset = host.getPreset("home-assistant", "scene")!;
      const mapped = preset.mapParams({ scene_id: "scene.movie_night" });
      expect(mapped.actionParams).toEqual({ scene_id: "scene.movie_night" });
    });

    it("climate preset maps temperature and hvac_mode", () => {
      const preset = host.getPreset("home-assistant", "climate")!;
      const mapped = preset.mapParams({
        entity_id: "climate.living_room",
        temperature: 22,
        hvac_mode: "heat",
      });
      expect(mapped.actionParams).toEqual({
        entity_id: "climate.living_room",
        temperature: 22,
        hvac_mode: "heat",
      });
      expect(mapped.stateParams).toEqual({ entity_id: "climate.living_room" });
    });

    it("sensor preset has no action params (read-only)", () => {
      const preset = host.getPreset("home-assistant", "sensor")!;
      const mapped = preset.mapParams({ entity_id: "sensor.temp" });
      expect(mapped.actionParams).toBeUndefined();
      expect(mapped.stateParams).toEqual({ entity_id: "sensor.temp" });
    });
  });
});

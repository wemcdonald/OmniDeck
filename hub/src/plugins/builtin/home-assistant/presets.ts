import type { ButtonPreset } from "../../types.js";

export const haPresets: ButtonPreset[] = [
  // -- Light: toggle with brightness progress, warm glow when on --
  {
    id: "light",
    name: "Light",
    defaults: {
      action: "toggle",
      icon: "mdi:lightbulb",
      stateProvider: "light_state",
    },
    mapParams(params) {
      return {
        actionParams: { entity_id: params.entity_id },
        stateParams: { entity_id: params.entity_id },
      };
    },
  },

  // -- Generic toggle: infers icon/color from entity domain --
  {
    id: "toggle",
    name: "Toggle",
    defaults: {
      action: "toggle",
      stateProvider: "entity_state",
    },
    mapParams(params) {
      return {
        actionParams: { entity_id: params.entity_id },
        stateParams: { entity_id: params.entity_id },
      };
    },
  },

  // -- Scene: one-tap activation, fixed purple background --
  {
    id: "scene",
    name: "Scene",
    defaults: {
      action: "run_scene",
      icon: "mdi:palette",
      background: "#8b5cf6",
    },
    mapParams(params) {
      return {
        actionParams: { scene_id: params.scene_id ?? params.entity_id },
      };
    },
  },

  // -- Script: run an HA script with optional variables --
  {
    id: "script",
    name: "Script",
    defaults: {
      action: "run_script",
      icon: "mdi:script-text",
      background: "#1e3a5f",
    },
    mapParams(params) {
      return {
        actionParams: {
          script_id: params.script_id ?? params.entity_id,
          variables: params.variables,
        },
      };
    },
  },

  // -- Climate: thermostat display with temp + hvac action colors --
  {
    id: "climate",
    name: "Climate",
    defaults: {
      action: "set_climate",
      icon: "mdi:thermostat",
      stateProvider: "climate_state",
    },
    mapParams(params) {
      return {
        actionParams: {
          entity_id: params.entity_id,
          temperature: params.temperature,
          hvac_mode: params.hvac_mode,
        },
        stateParams: { entity_id: params.entity_id },
      };
    },
  },

  // -- Cover: blinds/garage with position progress bar --
  {
    id: "cover",
    name: "Cover",
    defaults: {
      action: "set_cover",
      icon: "mdi:blinds",
      stateProvider: "cover_state",
    },
    mapParams(params) {
      return {
        actionParams: {
          entity_id: params.entity_id,
          position: params.position,
          command: params.command,
        },
        stateParams: { entity_id: params.entity_id },
      };
    },
  },

  // -- Sensor: read-only display with value + units --
  {
    id: "sensor",
    name: "Sensor",
    defaults: {
      icon: "mdi:chart-line",
      stateProvider: "sensor_value",
    },
    mapParams(params) {
      return {
        stateParams: { entity_id: params.entity_id },
      };
    },
  },

  // -- Lock: toggle with locked/unlocked state display --
  {
    id: "lock",
    name: "Lock",
    defaults: {
      action: "toggle_lock",
      icon: "mdi:lock",
      stateProvider: "lock_state",
    },
    mapParams(params) {
      return {
        actionParams: { entity_id: params.entity_id },
        stateParams: { entity_id: params.entity_id },
      };
    },
  },

  // -- Fan: toggle with speed percentage --
  {
    id: "fan",
    name: "Fan",
    defaults: {
      action: "toggle",
      icon: "mdi:fan",
      stateProvider: "fan_state",
    },
    mapParams(params) {
      return {
        actionParams: { entity_id: params.entity_id },
        stateParams: { entity_id: params.entity_id },
      };
    },
  },

  // -- Media player: play/pause with track info --
  {
    id: "media_player",
    name: "Media Player",
    defaults: {
      action: "media_play_pause",
      icon: "mdi:play-circle",
      stateProvider: "media_player_state",
    },
    mapParams(params) {
      return {
        actionParams: { entity_id: params.entity_id },
        stateParams: { entity_id: params.entity_id },
      };
    },
  },

  // -- Convenience aliases from old plugin (kept for compat) --
  {
    id: "light_toggle",
    name: "Light Toggle",
    defaults: {
      action: "toggle",
      icon: "mdi:lightbulb",
      stateProvider: "light_state",
    },
    mapParams(params) {
      return {
        actionParams: { entity_id: params.entity_id },
        stateParams: { entity_id: params.entity_id },
      };
    },
  },
  {
    id: "switch_toggle",
    name: "Switch Toggle",
    defaults: {
      action: "toggle",
      icon: "mdi:power",
      stateProvider: "entity_state",
    },
    mapParams(params) {
      return {
        actionParams: { entity_id: params.entity_id },
        stateParams: { entity_id: params.entity_id },
      };
    },
  },
  {
    id: "scene_activate",
    name: "Scene Activate",
    defaults: {
      action: "run_scene",
      icon: "mdi:palette",
      background: "#8b5cf6",
    },
    mapParams(params) {
      return {
        actionParams: { scene_id: params.entity_id },
      };
    },
  },
];

import type { ButtonPreset } from "../../types.js";

export const haPresets: ButtonPreset[] = [
  // -- Light: toggle with brightness progress, warm glow when on --
  {
    id: "light",
    name: "Light",
    description: "Toggle a light with brightness feedback",
    category: "Lighting",
    icon: "ms:lightbulb",
    action: "toggle",
    stateProvider: "light_state",
    defaults: {
      icon: "ms:lightbulb",
      label: "{{brightness_percent}}",
    },
    longPressAction: "turn_on",
    longPressDefaults: { brightness: 255 },
  },

  // -- Generic toggle: infers icon/color from entity domain --
  {
    id: "toggle",
    name: "Toggle",
    description: "Toggle any switchable entity on/off",
    category: "General",
    icon: "ms:power-settings-new",
    action: "toggle",
    stateProvider: "entity_state",
    defaults: {
      icon: "ms:power-settings-new",
    },
  },

  // -- Scene: one-tap activation, fixed purple background --
  {
    id: "scene",
    name: "Scene",
    description: "Activate a Home Assistant scene",
    category: "Automation",
    icon: "ms:palette",
    action: "run_scene",
    defaults: {
      icon: "ms:palette",
      background: "#8b5cf6",
    },
  },

  // -- Script: run an HA script with optional variables --
  {
    id: "script",
    name: "Script",
    description: "Run a Home Assistant script",
    category: "Automation",
    icon: "ms:description",
    action: "run_script",
    defaults: {
      icon: "ms:description",
    },
  },

  // -- Climate: thermostat display with temp + hvac action colors --
  {
    id: "climate",
    name: "Climate",
    description: "Control a thermostat with temperature display",
    category: "Climate",
    icon: "ms:thermostat",
    action: "set_climate",
    stateProvider: "climate_state",
    defaults: {
      icon: "ms:thermostat",
      label: "{{temperature}}",
      topLabel: "{{hvac_action}}",
    },
  },

  // -- Cover: blinds/garage with position progress bar --
  {
    id: "cover",
    name: "Cover",
    description: "Control blinds, shades, or garage doors",
    category: "General",
    icon: "ms:blinds",
    action: "set_cover",
    stateProvider: "cover_state",
    defaults: {
      icon: "ms:blinds",
      label: "{{position}}",
    },
  },

  // -- Sensor: read-only display with value + units --
  {
    id: "sensor",
    name: "Sensor",
    description: "Display a sensor value (read-only)",
    category: "Sensors",
    icon: "ms:show-chart",
    stateProvider: "sensor_value",
    defaults: {
      icon: "ms:show-chart",
      label: "{{value}}",
    },
  },

  // -- Lock: toggle with locked/unlocked state display --
  {
    id: "lock",
    name: "Lock",
    description: "Toggle a lock with locked/unlocked status",
    category: "Security",
    icon: "ms:lock",
    action: "toggle_lock",
    stateProvider: "lock_state",
    defaults: {
      icon: "ms:lock",
    },
    longPressAction: "unlock",
  },

  // -- Fan: toggle with speed percentage --
  {
    id: "fan",
    name: "Fan",
    description: "Toggle a fan with speed feedback",
    category: "Climate",
    icon: "ms:mode-fan",
    action: "toggle",
    stateProvider: "fan_state",
    defaults: {
      icon: "ms:mode-fan",
      label: "{{speed_percent}}",
    },
  },

  // -- Media player: play/pause with track info --
  {
    id: "media_player",
    name: "Media Player",
    description: "Play/pause with track info display",
    category: "Media",
    icon: "ms:play-circle",
    action: "media_play_pause",
    stateProvider: "media_player_state",
    defaults: {
      icon: "ms:play-circle",
      label: "{{media_title}}",
      topLabel: "{{media_artist}}",
    },
  },

];

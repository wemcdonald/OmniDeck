import type { ButtonPreset } from "../../types.js";

export const haPresets: ButtonPreset[] = [
  {
    id: "light_toggle",
    name: "Light Toggle",
    defaults: {
      action: "toggle",
      icon: "lightbulb",
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
    id: "switch_toggle",
    name: "Switch Toggle",
    defaults: {
      action: "toggle",
      icon: "power",
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
      action: "turn_on",
      icon: "scene",
      background: "#8b5cf6",
    },
    mapParams(params) {
      return {
        actionParams: { entity_id: params.entity_id },
        stateParams: { entity_id: params.entity_id },
      };
    },
  },
];

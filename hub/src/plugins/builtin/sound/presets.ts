import type { ButtonPreset } from "../../types.js";

export const soundPresets: ButtonPreset[] = [
  {
    id: "volume_up",
    name: "Volume Up",
    defaults: {
      action: "volume_up",
      icon: "ms:volume_up",
      label: "Vol +",
    },
    mapParams(params) {
      return {
        actionParams: { step: params.step ?? 5, target: params.target },
        stateParams: { target: params.target },
      };
    },
  },
  {
    id: "volume_down",
    name: "Volume Down",
    defaults: {
      action: "volume_down",
      icon: "ms:volume_down",
      label: "Vol -",
    },
    mapParams(params) {
      return {
        actionParams: { step: params.step ?? 5, target: params.target },
        stateParams: { target: params.target },
      };
    },
  },
  {
    id: "mute_toggle",
    name: "Mute Toggle",
    defaults: {
      action: "toggle_mute",
      icon: "ms:volume_up",
      stateProvider: "mute_state",
    },
    mapParams(params) {
      return {
        actionParams: { target: params.target },
        stateParams: { target: params.target },
      };
    },
  },
  {
    id: "mic_mute_toggle",
    name: "Mic Mute Toggle",
    defaults: {
      action: "toggle_mic_mute",
      icon: "ms:mic",
      stateProvider: "mic_state",
    },
    mapParams(params) {
      return {
        actionParams: { target: params.target },
        stateParams: { target: params.target },
      };
    },
  },
  {
    id: "volume_display",
    name: "Volume Display",
    defaults: {
      icon: "ms:volume_up",
      stateProvider: "volume_level",
    },
    mapParams(params) {
      return {
        stateParams: { target: params.target },
      };
    },
  },
];

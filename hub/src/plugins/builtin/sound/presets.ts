import type { ButtonPreset } from "../../types.js";

export const soundPresets: ButtonPreset[] = [
  {
    id: "volume_up",
    name: "Volume Up",
    description: "Increase system or target volume by a configurable step.",
    action: "volume_up",
    defaults: {
      icon: "ms:volume_up",
      label: "Vol +",
    },
  },
  {
    id: "volume_down",
    name: "Volume Down",
    description: "Decrease system or target volume by a configurable step.",
    action: "volume_down",
    defaults: {
      icon: "ms:volume_down",
      label: "Vol -",
    },
  },
  {
    id: "mute_toggle",
    name: "Mute Toggle",
    description: "Toggle mute on system or target audio output.",
    action: "toggle_mute",
    stateProvider: "mute_state",
    defaults: {
      icon: "ms:volume_up",
    },
  },
  {
    id: "mic_mute_toggle",
    name: "Mic Mute Toggle",
    description: "Toggle mute on the microphone input.",
    action: "toggle_mic_mute",
    stateProvider: "mic_state",
    defaults: {
      icon: "ms:mic",
    },
  },
  {
    id: "volume_display",
    name: "Volume Display",
    description: "Show current volume level without an action.",
    stateProvider: "volume_level",
    defaults: {
      icon: "ms:volume_up",
    },
  },
];

import type { ButtonPreset } from "../../types.js";

export const soundPresets: ButtonPreset[] = [
  {
    id: "volume_up",
    name: "Volume Up",
    description: "Increase system or target volume by a configurable step.",
    icon: "ms:volume-up",
    action: "volume_up",
    defaults: {
      icon: "ms:volume-up",
      label: "Vol +",
    },
  },
  {
    id: "volume_down",
    name: "Volume Down",
    description: "Decrease system or target volume by a configurable step.",
    icon: "ms:volume-down",
    action: "volume_down",
    defaults: {
      icon: "ms:volume-down",
      label: "Vol -",
    },
  },
  {
    id: "mute_toggle",
    name: "Mute Toggle",
    description: "Toggle mute on system or target audio output.",
    icon: "ms:volume-up",
    action: "toggle_mute",
    stateProvider: "mute_state",
    defaults: {
      icon: "ms:volume-up",
    },
  },
  {
    id: "mic_mute_toggle",
    name: "Mic Mute Toggle",
    description: "Toggle mute on the microphone input.",
    icon: "ms:mic",
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
    icon: "ms:volume-up",
    stateProvider: "volume_level",
    defaults: {
      icon: "ms:volume-up",
    },
  },
];

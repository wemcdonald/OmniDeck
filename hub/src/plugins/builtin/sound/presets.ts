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
  {
    id: "media_play_pause",
    name: "Play / Pause",
    description: "Toggle media playback via OS media key.",
    icon: "ms:play-pause",
    action: "media_play_pause",
    defaults: {
      icon: "ms:play-pause",
    },
  },
  {
    id: "media_next",
    name: "Next Track",
    description: "Skip to the next track via OS media key.",
    icon: "ms:skip-next",
    action: "media_next",
    defaults: {
      icon: "ms:skip-next",
    },
  },
  {
    id: "media_previous",
    name: "Previous Track",
    description: "Go to the previous track via OS media key.",
    icon: "ms:skip-previous",
    action: "media_previous",
    defaults: {
      icon: "ms:skip-previous",
    },
  },
];

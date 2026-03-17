import type { ButtonPreset } from "../../types.js";

export const spotifyPresets: ButtonPreset[] = [
  {
    id: "play_pause_button",
    name: "Play / Pause",
    defaults: {
      action: "play_pause",
      stateProvider: "playback_state",
    },
    mapParams(_params) {
      return { actionParams: {}, stateParams: {} };
    },
  },
  {
    id: "now_playing_display",
    name: "Now Playing",
    defaults: {
      stateProvider: "now_playing",
    },
    mapParams(_params) {
      return { stateParams: {} };
    },
  },
  {
    id: "skip_controls",
    name: "Skip Controls",
    defaults: {
      action: "next",
      icon: "skip-forward",
    },
    mapParams(params) {
      const direction = (params.direction as string) ?? "next";
      return {
        actionParams: {},
        stateParams: { direction },
      };
    },
  },
];

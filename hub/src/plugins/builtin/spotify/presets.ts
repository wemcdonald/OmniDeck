import type { ButtonPreset } from "../../types.js";

export const spotifyPresets: ButtonPreset[] = [
  {
    id: "play_pause_button",
    name: "Play / Pause",
    description: "Toggle Spotify playback between play and pause.",
    action: "play_pause",
    stateProvider: "playback_state",
    defaults: {},
  },
  {
    id: "now_playing_display",
    name: "Now Playing",
    description: "Display the currently playing track info.",
    stateProvider: "now_playing",
    defaults: {},
  },
  {
    id: "skip_controls",
    name: "Skip Controls",
    description: "Skip to the next or previous track.",
    action: "next",
    defaults: {
      icon: "skip-forward",
    },
  },
];

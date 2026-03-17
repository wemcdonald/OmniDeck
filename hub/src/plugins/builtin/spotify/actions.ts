import type { ActionDefinition } from "../../types.js";

type ApiCaller = (
  method: string,
  path: string,
  body?: Record<string, unknown>,
  query?: Record<string, string>,
) => Promise<void>;

export function createSpotifyActions(callApi: ApiCaller): ActionDefinition[] {
  return [
    {
      id: "play_pause",
      name: "Play / Pause",
      async execute(params) {
        const { is_playing } = params as { is_playing?: boolean };
        if (is_playing) {
          await callApi("PUT", "/me/player/pause");
        } else {
          await callApi("PUT", "/me/player/play");
        }
      },
    },
    {
      id: "next",
      name: "Next Track",
      async execute() {
        await callApi("POST", "/me/player/next");
      },
    },
    {
      id: "previous",
      name: "Previous Track",
      async execute() {
        await callApi("POST", "/me/player/previous");
      },
    },
    {
      id: "set_volume",
      name: "Set Volume",
      async execute(params) {
        const { volume_percent } = params as { volume_percent: number };
        await callApi("PUT", "/me/player/volume", undefined, {
          volume_percent: String(Math.max(0, Math.min(100, volume_percent))),
        });
      },
    },
    {
      id: "transfer_playback",
      name: "Transfer Playback",
      async execute(params) {
        const { device_id, play } = params as { device_id: string; play?: boolean };
        await callApi("PUT", "/me/player", {
          device_ids: [device_id],
          play: play ?? false,
        });
      },
    },
    {
      id: "toggle_shuffle",
      name: "Toggle Shuffle",
      async execute(params) {
        const { state } = params as { state: boolean };
        await callApi("PUT", "/me/player/shuffle", undefined, {
          state: String(state),
        });
      },
    },
    {
      id: "toggle_repeat",
      name: "Toggle Repeat",
      async execute(params) {
        const { state } = params as { state: "off" | "track" | "context" };
        await callApi("PUT", "/me/player/repeat", undefined, { state });
      },
    },
  ];
}

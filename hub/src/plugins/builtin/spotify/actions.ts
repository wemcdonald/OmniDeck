import { z } from "zod";
import { field } from "@omnideck/plugin-schema";
import type { ActionDefinition } from "../../types.js";

type ApiCaller = (
  method: string,
  path: string,
  body?: Record<string, unknown>,
  query?: Record<string, string>,
) => Promise<void>;

const playPauseSchema = z.object({
  is_playing: z.boolean().optional(),
});

const setVolumeSchema = z.object({
  volume_percent: field(z.number().min(0).max(100), { label: "Volume %" }),
});

const transferSchema = z.object({
  device_id: field(z.string(), { label: "Device ID" }),
  play: z.boolean().optional(),
});

const shuffleSchema = z.object({
  state: field(z.boolean(), { label: "Shuffle On" }),
});

const repeatSchema = z.object({
  state: field(z.enum(["off", "track", "context"]), { label: "Repeat Mode" }),
});

export function createSpotifyActions(callApi: ApiCaller): ActionDefinition[] {
  return [
    {
      id: "play_pause",
      name: "Play / Pause",
      description: "Toggle playback",
      icon: "ms:play-circle",
      paramsSchema: playPauseSchema,
      async execute(params) {
        const { is_playing } = playPauseSchema.parse(params);
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
      description: "Skip to next track",
      icon: "ms:skip-next",
      async execute() {
        await callApi("POST", "/me/player/next");
      },
    },
    {
      id: "previous",
      name: "Previous Track",
      description: "Skip to previous track",
      icon: "ms:skip-previous",
      async execute() {
        await callApi("POST", "/me/player/previous");
      },
    },
    {
      id: "set_volume",
      name: "Set Volume",
      description: "Set playback volume",
      icon: "ms:volume-up",
      paramsSchema: setVolumeSchema,
      async execute(params) {
        const { volume_percent } = setVolumeSchema.parse(params);
        await callApi("PUT", "/me/player/volume", undefined, {
          volume_percent: String(Math.max(0, Math.min(100, volume_percent))),
        });
      },
    },
    {
      id: "transfer_playback",
      name: "Transfer Playback",
      description: "Transfer playback to another device",
      icon: "ms:devices",
      paramsSchema: transferSchema,
      async execute(params) {
        const { device_id, play } = transferSchema.parse(params);
        await callApi("PUT", "/me/player", {
          device_ids: [device_id],
          play: play ?? false,
        });
      },
    },
    {
      id: "toggle_shuffle",
      name: "Toggle Shuffle",
      description: "Toggle shuffle mode",
      icon: "ms:shuffle",
      paramsSchema: shuffleSchema,
      async execute(params) {
        const { state } = shuffleSchema.parse(params);
        await callApi("PUT", "/me/player/shuffle", undefined, {
          state: String(state),
        });
      },
    },
    {
      id: "toggle_repeat",
      name: "Toggle Repeat",
      description: "Toggle repeat mode",
      icon: "ms:repeat",
      paramsSchema: repeatSchema,
      async execute(params) {
        const { state } = repeatSchema.parse(params);
        await callApi("PUT", "/me/player/repeat", undefined, { state });
      },
    },
  ];
}

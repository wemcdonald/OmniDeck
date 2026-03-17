import type { StateProviderDefinition, ButtonStateResult } from "../../types.js";
import type { StateStore } from "../../../state/store.js";

interface NowPlayingData {
  track: string;
  artist: string;
  album_art_url: string;
  progress_ms: number;
  duration_ms: number;
}

interface PlaybackStateData {
  is_playing: boolean;
  shuffle_state: boolean;
  repeat_state: "off" | "track" | "context";
}

interface DeviceData {
  id: string;
  name: string;
  is_active: boolean;
}

export function createSpotifyStateProviders(store: StateStore): StateProviderDefinition[] {
  return [
    {
      id: "now_playing",
      resolve(): ButtonStateResult {
        const data = store.get("spotify", "now_playing") as NowPlayingData | undefined;
        if (!data) {
          return { label: "Not playing", opacity: 0.6 };
        }
        const progress =
          data.duration_ms > 0 ? data.progress_ms / data.duration_ms : 0;
        return {
          label: data.track,
          topLabel: data.artist,
          icon: data.album_art_url,
          progress,
        };
      },
    },
    {
      id: "playback_state",
      resolve(): ButtonStateResult {
        const data = store.get("spotify", "playback_state") as PlaybackStateData | undefined;
        if (!data) {
          return { icon: "play", background: "#1db954" };
        }
        const badge = data.shuffle_state
          ? "S"
          : data.repeat_state !== "off"
            ? "R"
            : undefined;
        return {
          icon: data.is_playing ? "pause" : "play",
          background: data.is_playing ? "#1db954" : "#374151",
          badge,
        };
      },
    },
    {
      id: "device_list",
      resolve(): ButtonStateResult {
        const devices = store.get("spotify", "device_list") as DeviceData[] | undefined;
        if (!devices || devices.length === 0) {
          return { label: "No devices", opacity: 0.5 };
        }
        const active = devices.find((d) => d.is_active);
        return {
          label: active?.name ?? devices[0]?.name ?? "Unknown",
          badge: devices.length,
          background: active ? "#1db954" : "#374151",
        };
      },
    },
  ];
}

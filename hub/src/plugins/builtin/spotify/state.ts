import type { StateProviderDefinition, StateProviderResult } from "../../types.js";
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

const EMPTY_VARS: Record<string, string> = {};

export function createSpotifyStateProviders(store: StateStore): StateProviderDefinition[] {
  return [
    {
      id: "now_playing",
      name: "Now Playing",
      description: "Currently playing track with album art and progress",
      icon: "ms:music-note",
      providesIcon: true,
      templateVariables: [
        { key: "track", label: "Track Name", example: "Bohemian Rhapsody" },
        { key: "artist", label: "Artist", example: "Queen" },
      ],
      resolve(): StateProviderResult {
        const data = store.get("spotify", "now_playing") as NowPlayingData | undefined;
        if (!data) {
          return { state: { label: "Not playing", opacity: 0.6 }, variables: EMPTY_VARS };
        }
        const progress =
          data.duration_ms > 0 ? data.progress_ms / data.duration_ms : 0;
        return {
          state: {
            label: data.track,
            topLabel: data.artist,
            icon: data.album_art_url,
            progress,
          },
          variables: {
            track: data.track,
            artist: data.artist,
          },
        };
      },
    },
    {
      id: "playback_state",
      name: "Playback State",
      description: "Play/pause icon with shuffle/repeat indicators",
      icon: "ms:play-circle",
      providesIcon: true,
      templateVariables: [
        { key: "state", label: "State", example: "playing" },
      ],
      resolve(): StateProviderResult {
        const data = store.get("spotify", "playback_state") as PlaybackStateData | undefined;
        if (!data) {
          return { state: { icon: "play", background: "#1db954" }, variables: { state: "unknown" } };
        }
        const badge = data.shuffle_state
          ? "S"
          : data.repeat_state !== "off"
            ? "R"
            : undefined;
        return {
          state: {
            icon: data.is_playing ? "pause" : "play",
            background: data.is_playing ? "#1db954" : "#374151",
            badge,
          },
          variables: {
            state: data.is_playing ? "playing" : "paused",
          },
        };
      },
    },
    {
      id: "device_list",
      name: "Device List",
      description: "Active Spotify device with device count badge",
      icon: "ms:devices",
      templateVariables: [
        { key: "active_device", label: "Active Device", example: "MacBook" },
        { key: "device_count", label: "Device Count", example: "3" },
      ],
      resolve(): StateProviderResult {
        const devices = store.get("spotify", "device_list") as DeviceData[] | undefined;
        if (!devices || devices.length === 0) {
          return { state: { label: "No devices", opacity: 0.5 }, variables: EMPTY_VARS };
        }
        const active = devices.find((d) => d.is_active);
        const activeName = active?.name ?? devices[0]?.name ?? "Unknown";
        return {
          state: {
            label: activeName,
            badge: devices.length,
            background: active ? "#1db954" : "#374151",
          },
          variables: {
            active_device: activeName,
            device_count: String(devices.length),
          },
        };
      },
    },
  ];
}

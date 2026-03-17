import type { OmniDeckPlugin, PluginContext } from "../../types.js";
import { createSpotifyActions } from "./actions.js";
import { createSpotifyStateProviders } from "./state.js";
import { spotifyPresets } from "./presets.js";

interface SpotifyConfig {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  poll_interval?: number;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface SpotifyTrack {
  name: string;
  artists: Array<{ name: string }>;
  album: { images: Array<{ url: string }> };
  duration_ms: number;
}

interface PlaybackResponse {
  is_playing: boolean;
  progress_ms: number;
  shuffle_state: boolean;
  repeat_state: "off" | "track" | "context";
  item: SpotifyTrack | null;
  device: {
    id: string;
    name: string;
  } | null;
}

interface DevicesResponse {
  devices: Array<{ id: string; name: string; is_active: boolean }>;
}

const SPOTIFY_API = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

export const spotifyPlugin: OmniDeckPlugin = {
  id: "spotify",
  name: "Spotify",
  version: "1.0.0",

  async init(ctx: PluginContext) {
    const config = ctx.config as SpotifyConfig;
    const pollIntervalMs = (config.poll_interval ?? 2000);

    let accessToken: string | null = null;
    let tokenExpiresAt = 0;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    // Refresh OAuth access token using client credentials + refresh token
    async function refreshAccessToken(): Promise<string | null> {
      try {
        const credentials = Buffer.from(
          `${config.client_id}:${config.client_secret}`,
        ).toString("base64");

        const res = await fetch(SPOTIFY_TOKEN_URL, {
          method: "POST",
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: config.refresh_token,
          }),
        });

        if (!res.ok) {
          ctx.log.warn({ status: res.status }, "Spotify token refresh failed");
          return null;
        }

        const data = (await res.json()) as TokenResponse;
        tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
        return data.access_token;
      } catch (err) {
        ctx.log.warn({ err }, "Spotify token refresh error");
        return null;
      }
    }

    async function getToken(): Promise<string | null> {
      if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
      accessToken = await refreshAccessToken();
      return accessToken;
    }

    // Generic Spotify Web API caller
    async function callApi(
      method: string,
      path: string,
      body?: Record<string, unknown>,
      query?: Record<string, string>,
    ): Promise<void> {
      const token = await getToken();
      if (!token) {
        ctx.log.warn("Spotify: no access token, skipping API call");
        return;
      }

      let url = `${SPOTIFY_API}${path}`;
      if (query && Object.keys(query).length > 0) {
        url += "?" + new URLSearchParams(query).toString();
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (body) headers["Content-Type"] = "application/json";

      try {
        const res = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!res.ok && res.status !== 204) {
          ctx.log.warn({ status: res.status, path }, "Spotify API call failed");
        }
      } catch (err) {
        ctx.log.warn({ err, path }, "Spotify API call error");
      }
    }

    // Poll Spotify for current playback state and device list
    async function pollPlayback(): Promise<void> {
      const token = await getToken();
      if (!token) return;

      const headers = { Authorization: `Bearer ${token}` };

      try {
        const [playbackRes, devicesRes] = await Promise.all([
          fetch(`${SPOTIFY_API}/me/player`, { headers }),
          fetch(`${SPOTIFY_API}/me/player/devices`, { headers }),
        ]);

        // Playback state (204 = nothing playing)
        if (playbackRes.ok && playbackRes.status !== 204) {
          const pb = (await playbackRes.json()) as PlaybackResponse;

          ctx.state.set("spotify", "playback_state", {
            is_playing: pb.is_playing,
            shuffle_state: pb.shuffle_state,
            repeat_state: pb.repeat_state,
          });

          if (pb.item) {
            ctx.state.set("spotify", "now_playing", {
              track: pb.item.name,
              artist: pb.item.artists.map((a) => a.name).join(", "),
              album_art_url: pb.item.album.images[0]?.url ?? "",
              progress_ms: pb.progress_ms,
              duration_ms: pb.item.duration_ms,
            });
          } else {
            ctx.state.set("spotify", "now_playing", undefined);
          }
        } else if (playbackRes.status === 204) {
          ctx.state.set("spotify", "playback_state", {
            is_playing: false,
            shuffle_state: false,
            repeat_state: "off",
          });
          ctx.state.set("spotify", "now_playing", undefined);
        }

        // Device list
        if (devicesRes.ok) {
          const dd = (await devicesRes.json()) as DevicesResponse;
          ctx.state.set("spotify", "device_list", dd.devices);
        }
      } catch (err) {
        ctx.log.warn({ err }, "Spotify poll error");
      }
    }

    // Register actions, state providers, presets (always — even without credentials)
    for (const action of createSpotifyActions(callApi)) {
      ctx.registerAction(action);
    }
    for (const provider of createSpotifyStateProviders(ctx.state)) {
      ctx.registerStateProvider(provider);
    }
    for (const preset of spotifyPresets) {
      ctx.registerPreset(preset);
    }

    // Start polling — non-blocking, swallows auth failures gracefully
    if (pollIntervalMs < 99000) {
      // skip in tests (poll_interval: 99999)
      pollTimer = setInterval(() => {
        pollPlayback().catch((err) => ctx.log.warn({ err }, "Spotify poll interval error"));
      }, pollIntervalMs);

      // Initial poll (don't crash if it fails)
      pollPlayback().catch((err) => ctx.log.warn({ err }, "Spotify initial poll error"));
    }

    // Store destroy cleanup reference
    (ctx as unknown as { _spotifyPollTimer: typeof pollTimer })._spotifyPollTimer = pollTimer;
  },

  async destroy() {
    // No-op: timer cleanup handled externally if needed
  },
};

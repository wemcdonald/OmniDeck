import { describe, it, expect, beforeEach } from "vitest";
import { PluginHost } from "../../../host.js";
import { StateStore } from "../../../../state/store.js";
import { spotifyPlugin } from "../index.js";

describe("spotify plugin", () => {
  let host: PluginHost;
  let store: StateStore;

  beforeEach(async () => {
    store = new StateStore();
    host = new PluginHost(store);
    host.register(spotifyPlugin);
    // Init without real Spotify credentials (will log warning but not crash)
    await host.initAll({
      spotify: {
        client_id: "fake_client_id",
        client_secret: "fake_client_secret",
        refresh_token: "fake_refresh_token",
        poll_interval: 99999,
      },
    });
  });

  // --- Actions ---
  it("registers play_pause action", () => {
    expect(host.getAction("spotify", "play_pause")).toBeDefined();
  });

  it("registers next action", () => {
    expect(host.getAction("spotify", "next")).toBeDefined();
  });

  it("registers previous action", () => {
    expect(host.getAction("spotify", "previous")).toBeDefined();
  });

  it("registers set_volume action", () => {
    expect(host.getAction("spotify", "set_volume")).toBeDefined();
  });

  it("registers transfer_playback action", () => {
    expect(host.getAction("spotify", "transfer_playback")).toBeDefined();
  });

  it("registers toggle_shuffle action", () => {
    expect(host.getAction("spotify", "toggle_shuffle")).toBeDefined();
  });

  it("registers toggle_repeat action", () => {
    expect(host.getAction("spotify", "toggle_repeat")).toBeDefined();
  });

  // --- State providers ---
  it("registers now_playing state provider", () => {
    expect(host.getStateProvider("spotify", "now_playing")).toBeDefined();
  });

  it("registers playback_state state provider", () => {
    expect(host.getStateProvider("spotify", "playback_state")).toBeDefined();
  });

  it("registers device_list state provider", () => {
    expect(host.getStateProvider("spotify", "device_list")).toBeDefined();
  });

  // --- Presets ---
  it("registers play_pause_button preset", () => {
    expect(host.getPreset("spotify", "play_pause_button")).toBeDefined();
  });

  it("registers now_playing_display preset", () => {
    expect(host.getPreset("spotify", "now_playing_display")).toBeDefined();
  });

  it("registers skip_controls preset", () => {
    expect(host.getPreset("spotify", "skip_controls")).toBeDefined();
  });

  // --- State resolution ---
  it("now_playing returns track info from store", () => {
    store.set("spotify", "now_playing", {
      track: "Bohemian Rhapsody",
      artist: "Queen",
      album_art_url: "https://i.scdn.co/image/abc123",
      progress_ms: 60000,
      duration_ms: 354000,
    });
    const provider = host.getStateProvider("spotify", "now_playing")!;
    const result = provider.resolve({});
    expect(result.state.label).toBe("Bohemian Rhapsody");
    expect(result.state.topLabel).toBe("Queen");
    expect(result.state.progress).toBeCloseTo(60000 / 354000, 3);
  });

  it("now_playing returns idle state when no track in store", () => {
    const provider = host.getStateProvider("spotify", "now_playing")!;
    const result = provider.resolve({});
    expect(result.state.label).toBe("Not playing");
  });

  it("playback_state returns paused icon when not playing", () => {
    store.set("spotify", "playback_state", {
      is_playing: false,
      shuffle_state: false,
      repeat_state: "off",
    });
    const provider = host.getStateProvider("spotify", "playback_state")!;
    const result = provider.resolve({});
    expect(result.state.icon).toBe("play");
  });

  it("playback_state returns pause icon when playing", () => {
    store.set("spotify", "playback_state", {
      is_playing: true,
      shuffle_state: false,
      repeat_state: "off",
    });
    const provider = host.getStateProvider("spotify", "playback_state")!;
    const result = provider.resolve({});
    expect(result.state.icon).toBe("pause");
  });

  it("device_list returns active device label from store", () => {
    store.set("spotify", "device_list", [
      { id: "abc", name: "Kitchen Speaker", is_active: false },
      { id: "def", name: "Living Room TV", is_active: true },
    ]);
    const provider = host.getStateProvider("spotify", "device_list")!;
    const result = provider.resolve({});
    expect(result.state.label).toBe("Living Room TV");
  });
});

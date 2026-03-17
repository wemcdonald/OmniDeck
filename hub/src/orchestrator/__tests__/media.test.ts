import { describe, it, expect, beforeEach } from "vitest";
import { MediaRouter } from "../media.js";

describe("MediaRouter", () => {
  describe("active_player strategy", () => {
    it("returns Spotify's active device when available", () => {
      const router = new MediaRouter(
        { strategy: "active_player" },
        () => "mac",
        () => "windows-spotify",
      );
      expect(router.resolveMediaTarget()).toBe("windows-spotify");
    });

    it("falls back to focused device when no Spotify active device", () => {
      const router = new MediaRouter(
        { strategy: "active_player" },
        () => "mac",
        () => null,
      );
      expect(router.resolveMediaTarget()).toBe("mac");
    });

    it("returns hub when neither Spotify device nor focused device is available", () => {
      const router = new MediaRouter(
        { strategy: "active_player" },
        () => null,
        () => null,
      );
      expect(router.resolveMediaTarget()).toBe("hub");
    });
  });

  describe("focused strategy", () => {
    it("returns the focused device", () => {
      const router = new MediaRouter(
        { strategy: "focused" },
        () => "linux-box",
        () => null,
      );
      expect(router.resolveMediaTarget()).toBe("linux-box");
    });

    it("returns hub when no focused device", () => {
      const router = new MediaRouter(
        { strategy: "focused" },
        () => null,
        () => null,
      );
      expect(router.resolveMediaTarget()).toBe("hub");
    });
  });

  describe("manual strategy", () => {
    it("returns the pinned device", () => {
      const router = new MediaRouter(
        { strategy: "manual", pinned_device: "living-room-pc" },
        () => "mac",
        () => "windows-spotify",
      );
      expect(router.resolveMediaTarget()).toBe("living-room-pc");
    });

    it("returns hub when no pinned device is set", () => {
      const router = new MediaRouter(
        { strategy: "manual" },
        () => "mac",
        () => "windows-spotify",
      );
      expect(router.resolveMediaTarget()).toBe("hub");
    });
  });
});

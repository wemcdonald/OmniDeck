export interface MediaRouterConfig {
  strategy: "active_player" | "focused" | "manual";
  pinned_device?: string;
}

export interface MediaRouter {
  resolveMediaTarget(): string | "hub";
}

export class MediaRouter {
  private config: MediaRouterConfig;
  private getFocusedDevice: () => string | null;
  private getActiveSpotifyDevice: () => string | null;

  constructor(
    config: MediaRouterConfig,
    getFocusedDevice: () => string | null,
    getActiveSpotifyDevice: () => string | null,
  ) {
    this.config = config;
    this.getFocusedDevice = getFocusedDevice;
    this.getActiveSpotifyDevice = getActiveSpotifyDevice;
  }

  resolveMediaTarget(): string | "hub" {
    switch (this.config.strategy) {
      case "active_player": {
        const spotifyDevice = this.getActiveSpotifyDevice();
        if (spotifyDevice !== null) return spotifyDevice;
        const focusedDevice = this.getFocusedDevice();
        if (focusedDevice !== null) return focusedDevice;
        return "hub";
      }
      case "focused": {
        const focusedDevice = this.getFocusedDevice();
        if (focusedDevice !== null) return focusedDevice;
        return "hub";
      }
      case "manual": {
        if (this.config.pinned_device !== undefined) {
          return this.config.pinned_device;
        }
        return "hub";
      }
    }
  }
}

import { FocusTracker } from "./focus.js";
import { PresenceManager } from "./presence.js";
import { MediaRouter, type MediaRouterConfig } from "./media.js";
import { StateStore } from "../state/store.js";

export interface OrchestratorConfig {
  focus: {
    strategy: "idle_time" | "manual" | "active_window";
    idle_threshold_ms: number;
    switch_page_on_focus: boolean;
  };
  media: MediaRouterConfig;
  device_pages?: Record<string, string>;
}

export interface AgentStateUpdate {
  online: boolean;
  idleTimeMs: number;
}

export class Orchestrator {
  readonly focusTracker: FocusTracker;
  readonly presenceManager: PresenceManager;
  readonly mediaRouter: MediaRouter;

  private readonly config: OrchestratorConfig;
  private readonly store: StateStore;

  constructor(config: OrchestratorConfig, store: StateStore) {
    this.config = config;
    this.store = store;

    this.focusTracker = new FocusTracker({
      strategy: config.focus.strategy,
      idle_threshold_ms: config.focus.idle_threshold_ms,
    });

    this.presenceManager = new PresenceManager();

    this.mediaRouter = new MediaRouter(
      config.media,
      () => this.focusTracker.focused,
      () => null, // no Spotify integration at orchestrator level
    );

    this.focusTracker.onFocusChange((_from, to) => {
      if (!config.focus.switch_page_on_focus) return;
      if (to === null) return;
      const pageId = config.device_pages?.[to];
      if (pageId === undefined) return;
      this.store.set("omnideck-core", "current_page", pageId);
    });
  }

  handleAgentState(deviceId: string, state: AgentStateUpdate): void {
    this.focusTracker.updateDevice(deviceId, {
      online: state.online,
      idleTimeMs: state.idleTimeMs,
    });
  }

  handleAgentConnect(deviceId: string): void {
    this.presenceManager.deviceConnected(deviceId);
  }

  handleAgentDisconnect(deviceId: string): void {
    this.presenceManager.deviceDisconnected(deviceId);
  }

  getMediaTarget(): string {
    return this.mediaRouter.resolveMediaTarget();
  }

  get focusedDevice(): string | null {
    return this.focusTracker.focused;
  }
}

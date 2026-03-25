import type { Logger } from "pino";
import type { StateStore } from "../../../state/store.js";
import type { HaClient } from "./client.js";

export interface PublishConfig {
  enabled: boolean;
  /** Which method to use: "events" fires HA events, "input_helpers" updates input_* entities */
  method: "events" | "input_helpers";
  /** How often to publish aggregate state (in ms). Default: 5000 */
  update_interval_ms: number;
  /** Publish which device is focused */
  active_device: boolean;
  /** Publish active window app name */
  active_window: boolean;
  /** Publish per-device online/offline status */
  device_presence: boolean;
  /** Publish per-device idle time */
  idle_time: boolean;
  /** Publish active OmniDeck mode */
  active_mode: boolean;
  /** Entity prefix for input helpers. Default: "omnideck" */
  entity_prefix: string;
}

const DEFAULT_PUBLISH_CONFIG: PublishConfig = {
  enabled: false,
  method: "events",
  update_interval_ms: 5000,
  active_device: true,
  active_window: true,
  device_presence: true,
  idle_time: false,
  active_mode: true,
  entity_prefix: "omnideck",
};

interface AgentSnapshot {
  hostname: string;
  online: boolean;
  active_window_app?: string;
  active_window_title?: string;
  idle_time_ms?: number;
}

/**
 * Publishes OmniDeck orchestrator state to Home Assistant.
 *
 * Watches the state store for agent updates and periodically
 * pushes aggregate state to HA via events or input helper entities.
 */
export class HaStatePublisher {
  private config: PublishConfig;
  private store: StateStore;
  private client: HaClient;
  private log: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPublished = 0;

  constructor(
    rawConfig: Record<string, unknown> | undefined,
    store: StateStore,
    client: HaClient,
    log: Logger,
  ) {
    this.config = { ...DEFAULT_PUBLISH_CONFIG, ...rawConfig } as PublishConfig;
    this.store = store;
    this.client = client;
    this.log = log;
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  start(): void {
    if (!this.config.enabled) return;

    this.log.info(
      { method: this.config.method, intervalMs: this.config.update_interval_ms },
      "HA state publisher started",
    );

    this.timer = setInterval(() => {
      this.publish().catch((err) => this.log.warn({ err }, "HA publish error"));
    }, this.config.update_interval_ms);

    // Publish mode changes immediately (not just on polling interval)
    if (this.config.active_mode) {
      this.store.onChange((pluginId, key) => {
        if (pluginId === "omnideck-core" && key === "active_mode") {
          this.publish().catch((err) => this.log.warn({ err }, "HA mode publish error"));
        }
      });
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async publish(): Promise<void> {
    if (!this.client.connected) return;

    const agents = this.gatherAgentState();
    const focusedDevice = this.getFocusedDevice(agents);

    if (this.config.method === "events") {
      await this.publishViaEvents(agents, focusedDevice);
    } else {
      await this.publishViaInputHelpers(agents, focusedDevice);
    }

    this.lastPublished = Date.now();
  }

  private async publishViaEvents(
    agents: AgentSnapshot[],
    focusedDevice: string | null,
  ): Promise<void> {
    const eventData: Record<string, unknown> = {};

    if (this.config.active_device) {
      eventData.active_device = focusedDevice;
    }

    if (this.config.active_window && focusedDevice) {
      const focused = agents.find((a) => a.hostname === focusedDevice);
      eventData.active_window_app = focused?.active_window_app ?? null;
      eventData.active_window_title = focused?.active_window_title ?? null;
    }

    if (this.config.device_presence) {
      const devices: Record<string, boolean> = {};
      for (const a of agents) devices[a.hostname] = a.online;
      eventData.devices = devices;
    }

    if (this.config.idle_time) {
      const idle: Record<string, number | null> = {};
      for (const a of agents) idle[a.hostname] = a.idle_time_ms ?? null;
      eventData.idle_times = idle;
    }

    if (this.config.active_mode) {
      eventData.active_mode = this.getActiveMode();
    }

    await this.client.fireEvent("omnideck_state", eventData);
  }

  private async publishViaInputHelpers(
    agents: AgentSnapshot[],
    focusedDevice: string | null,
  ): Promise<void> {
    const prefix = this.config.entity_prefix;

    const calls: Promise<void>[] = [];

    if (this.config.active_device) {
      calls.push(
        this.client.callService(
          "input_text",
          "set_value",
          { value: focusedDevice ?? "none" },
          { entity_id: `input_text.${prefix}_active_device` },
        ),
      );
    }

    if (this.config.active_window && focusedDevice) {
      const focused = agents.find((a) => a.hostname === focusedDevice);
      calls.push(
        this.client.callService(
          "input_text",
          "set_value",
          { value: focused?.active_window_app ?? "" },
          { entity_id: `input_text.${prefix}_active_window` },
        ),
      );
    }

    if (this.config.device_presence) {
      for (const a of agents) {
        // Sanitize hostname for entity ID (only lowercase, numbers, underscores)
        const safeId = a.hostname.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
        calls.push(
          this.client.callService(
            "input_boolean",
            a.online ? "turn_on" : "turn_off",
            undefined,
            { entity_id: `input_boolean.${prefix}_${safeId}_online` },
          ),
        );
      }
    }

    if (this.config.active_mode) {
      calls.push(
        this.client.callService(
          "input_text",
          "set_value",
          { value: this.getActiveMode() },
          { entity_id: `input_text.${prefix}_active_mode` },
        ),
      );
    }

    // Fire calls in parallel, but don't fail the whole batch if one fails
    const results = await Promise.allSettled(calls);
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      this.log.warn({ count: failures.length }, "Some input helper updates failed");
    }
  }

  private gatherAgentState(): AgentSnapshot[] {
    const agents: AgentSnapshot[] = [];

    // Agent state is stored under os-control:agent:<hostname>:state
    // Online status is tracked separately under os-control:agent:<hostname>:online
    const allOsControl = this.store.getAll("os-control");
    for (const [key, value] of allOsControl) {
      const match = key.match(/^agent:(.+):state$/);
      if (!match) continue;
      const hostname = match[1];
      const state = value as Record<string, unknown> | undefined;
      if (!state) continue;
      const online = (this.store.get("os-control", `agent:${hostname}:online`) as boolean) ?? false;
      agents.push({
        hostname,
        online,
        active_window_app: state.active_window_app as string | undefined,
        active_window_title: state.active_window_title as string | undefined,
        idle_time_ms: state.idle_time_ms as number | undefined,
      });
    }

    return agents;
  }

  private getActiveMode(): string {
    const mode = this.store.get("omnideck-core", "active_mode") as string | null;
    return mode ?? "none";
  }

  private getFocusedDevice(agents: AgentSnapshot[]): string | null {
    // Use orchestrator's focused device if available
    const focused = this.store.get("orchestrator", "focused_device") as string | undefined;
    if (focused) return focused;

    // Fallback: pick the agent with the lowest idle time
    let best: AgentSnapshot | null = null;
    let bestIdle = Infinity;
    for (const a of agents) {
      const idle = a.idle_time_ms ?? Infinity;
      if (idle < bestIdle) {
        bestIdle = idle;
        best = a;
      }
    }
    return best?.hostname ?? null;
  }
}

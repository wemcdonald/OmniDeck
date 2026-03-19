import WebSocket from "ws";
import type { Logger } from "pino";

// -- HA WebSocket protocol types --

interface HaMessageBase {
  id?: number;
  type: string;
}

interface HaAuthRequired extends HaMessageBase {
  type: "auth_required";
  ha_version: string;
}

interface HaAuthOk extends HaMessageBase {
  type: "auth_ok";
  ha_version: string;
}

interface HaResult extends HaMessageBase {
  type: "result";
  id: number;
  success: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

interface HaEvent extends HaMessageBase {
  type: "event";
  id: number;
  event: {
    event_type: string;
    data: {
      entity_id: string;
      new_state?: HaEntityState | null;
      old_state?: HaEntityState | null;
    };
  };
}

export interface HaEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

type HaIncoming = HaAuthRequired | HaAuthOk | HaResult | HaEvent | HaMessageBase;

type StateChangedCallback = (entityId: string, newState: HaEntityState) => void;
type ConnectionCallback = (connected: boolean) => void;

interface PendingCommand {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface HaClientOptions {
  url: string;
  token: string;
  log: Logger;
  reconnect?: boolean;
}

/**
 * Home Assistant WebSocket API client.
 *
 * Handles authentication, auto-reconnect with exponential backoff,
 * command/response correlation, and real-time state subscriptions.
 */
export class HaClient {
  private ws: WebSocket | null = null;
  private msgId = 1;
  private pending = new Map<number, PendingCommand>();
  private stateCallbacks: StateChangedCallback[] = [];
  private connectionCallbacks: ConnectionCallback[] = [];
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000; // starts at 1s, doubles up to 60s
  private authenticated = false;
  private haVersion = "";

  private readonly url: string;
  private readonly token: string;
  private readonly log: Logger;
  private readonly shouldReconnect: boolean;

  constructor(opts: HaClientOptions) {
    this.url = opts.url;
    this.token = opts.token;
    this.log = opts.log;
    this.shouldReconnect = opts.reconnect ?? true;
  }

  // -- Public API --

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.authenticated;
  }

  get version(): string {
    return this.haVersion;
  }

  connect(): void {
    if (this.destroyed) return;
    this.doConnect();
  }

  onStateChanged(cb: StateChangedCallback): void {
    this.stateCallbacks.push(cb);
  }

  onConnection(cb: ConnectionCallback): void {
    this.connectionCallbacks.push(cb);
  }

  /** Send a command and wait for the result. Returns the `result` field. */
  async sendCommand(type: string, data?: Record<string, unknown>, timeoutMs = 10000): Promise<unknown> {
    if (!this.connected) {
      throw new Error("Not connected to Home Assistant");
    }
    const id = this.msgId++;
    const msg = { id, type, ...data };
    this.ws!.send(JSON.stringify(msg));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`HA command timeout: ${type} (id=${id})`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  /** Call an HA service. Entity IDs go in `target`, extra data in `service_data`. */
  async callService(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: { entity_id?: string | string[] },
  ): Promise<void> {
    const data: Record<string, unknown> = { domain, service };
    if (serviceData && Object.keys(serviceData).length > 0) {
      data.service_data = serviceData;
    }
    if (target) {
      data.target = target;
    }
    await this.sendCommand("call_service", data);
  }

  /** Fire a custom event on the HA event bus. */
  async fireEvent(eventType: string, eventData?: Record<string, unknown>): Promise<void> {
    const data: Record<string, unknown> = { event_type: eventType };
    if (eventData) data.event_data = eventData;
    await this.sendCommand("fire_event", data);
  }

  /** Fetch all current entity states. */
  async getStates(): Promise<HaEntityState[]> {
    const result = await this.sendCommand("get_states");
    return (result ?? []) as HaEntityState[];
  }

  /** Fetch the entity registry (includes friendly names, device info, etc.) */
  async getEntityRegistry(): Promise<Array<Record<string, unknown>>> {
    const result = await this.sendCommand("config/entity_registry/list");
    return (result ?? []) as Array<Record<string, unknown>>;
  }

  /** Subscribe to state_changed events. Called automatically on connect. */
  async subscribeStateChanges(): Promise<void> {
    await this.sendCommand("subscribe_events", { event_type: "state_changed" });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Client destroyed"));
    }
    this.pending.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // -- Connection internals --

  private doConnect(): void {
    if (this.destroyed) return;

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.log.warn({ err }, "HA WebSocket creation failed");
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      this.log.info({ url: this.url }, "WebSocket connected to HA");
    });

    this.ws.on("message", (raw) => {
      this.handleMessage(raw.toString());
    });

    this.ws.on("close", () => {
      const wasAuthenticated = this.authenticated;
      this.authenticated = false;
      if (wasAuthenticated) {
        this.notifyConnection(false);
      }
      if (!this.destroyed) {
        this.log.info("HA WebSocket closed");
        this.scheduleReconnect();
      }
    });

    this.ws.on("error", (err: Error) => {
      this.log.warn({ err: err.message }, "HA WebSocket error");
    });
  }

  private handleMessage(raw: string): void {
    let msg: HaIncoming;
    try {
      msg = JSON.parse(raw) as HaIncoming;
    } catch {
      return;
    }

    switch (msg.type) {
      case "auth_required":
        this.ws!.send(JSON.stringify({ type: "auth", access_token: this.token }));
        break;

      case "auth_ok": {
        const authOk = msg as HaAuthOk;
        this.haVersion = authOk.ha_version;
        this.authenticated = true;
        this.reconnectDelay = 1000; // reset backoff
        this.log.info({ ha_version: this.haVersion }, "HA authenticated");
        this.notifyConnection(true);
        this.onAuthenticated();
        break;
      }

      case "auth_invalid":
        this.log.error("HA authentication failed — check your token");
        this.destroyed = true; // don't reconnect with bad credentials
        this.ws?.close();
        break;

      case "result": {
        const result = msg as HaResult;
        const pending = this.pending.get(result.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(result.id);
          if (result.success) {
            pending.resolve(result.result);
          } else {
            pending.reject(new Error(result.error?.message ?? "HA command failed"));
          }
        }
        break;
      }

      case "event": {
        const event = msg as HaEvent;
        if (event.event.event_type === "state_changed" && event.event.data.new_state) {
          const newState = event.event.data.new_state;
          for (const cb of this.stateCallbacks) {
            cb(event.event.data.entity_id, newState);
          }
        }
        break;
      }
    }
  }

  private async onAuthenticated(): Promise<void> {
    try {
      // Fetch all current states so buttons render immediately
      const states = await this.getStates();
      this.log.info({ count: states.length }, "Fetched initial HA states");
      for (const s of states) {
        for (const cb of this.stateCallbacks) {
          cb(s.entity_id, s);
        }
      }

      // Subscribe to real-time state changes
      await this.subscribeStateChanges();
      this.log.info("Subscribed to HA state_changed events");
    } catch (err) {
      this.log.warn({ err }, "Post-auth setup failed");
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || !this.shouldReconnect) return;
    this.log.info({ delayMs: this.reconnectDelay }, "Scheduling HA reconnect");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
  }

  private notifyConnection(connected: boolean): void {
    for (const cb of this.connectionCallbacks) {
      cb(connected);
    }
  }
}

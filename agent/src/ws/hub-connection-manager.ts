import { HubConnection, type HubMessageHandler } from "./hub-connection.js";
import type { WsMessage } from "./protocol.js";
import type { AgentCredentials } from "../credentials.js";
import type { AgentClientOptions } from "./client.js";
import type { HubResolver } from "../mdns-resolver.js";
import { createLogger } from "../logger.js";

const log = createLogger("hub-manager");

type ConnectionLifecycleCb = (conn: HubConnection) => void;
type DisconnectCb = (conn: HubConnection, reason: string) => void;

export interface AddHubOptions {
  credentials: AgentCredentials;
  clientOptions: Omit<AgentClientOptions, "hubUrl" | "auth" | "caCert">;
}

/**
 * Owns every live HubConnection the agent currently maintains. Message
 * handlers are registered once on the manager and are dispatched to every
 * connection; broadcast() fans out to all connected hubs; connect/disconnect
 * callbacks fire per-hub so the caller (Agent) can replay cached state.
 */
export class HubConnectionManager {
  private hubs = new Map<string, HubConnection>();
  private messageHandlers = new Map<string, HubMessageHandler>();
  private onConnectCbs: ConnectionLifecycleCb[] = [];
  private onDisconnectCbs: DisconnectCb[] = [];
  private onReconnectingCbs: ConnectionLifecycleCb[] = [];
  private resolver?: HubResolver;

  constructor(opts: { resolver?: HubResolver } = {}) {
    this.resolver = opts.resolver;
  }

  /** Register a handler for a given message type. Applied to every connection. */
  onMessage(type: string, handler: HubMessageHandler): void {
    this.messageHandlers.set(type, handler);
    for (const conn of this.hubs.values()) {
      this.wireHandler(conn, type, handler);
    }
  }

  onAnyConnect(cb: ConnectionLifecycleCb): void {
    this.onConnectCbs.push(cb);
  }

  onAnyDisconnect(cb: DisconnectCb): void {
    this.onDisconnectCbs.push(cb);
  }

  onAnyReconnecting(cb: ConnectionLifecycleCb): void {
    this.onReconnectingCbs.push(cb);
  }

  /** Create and start a new HubConnection. Returns it once connect() resolves. */
  async addHub(opts: AddHubOptions): Promise<HubConnection> {
    if (this.hubs.has(opts.credentials.agent_id)) {
      throw new Error(`Hub already in manager: ${opts.credentials.agent_id}`);
    }
    const conn = new HubConnection({
      credentials: opts.credentials,
      clientOptions: opts.clientOptions,
      resolver: this.resolver,
      onConnected: (c) => {
        log.info("Hub connected", { agentId: c.agentId, hub: c.credentials.hub_name });
        for (const cb of this.onConnectCbs) cb(c);
      },
      onDisconnected: (c, reason) => {
        log.info("Hub disconnected", { agentId: c.agentId, hub: c.credentials.hub_name, reason });
        for (const cb of this.onDisconnectCbs) cb(c, reason);
      },
      onReconnecting: (c) => {
        for (const cb of this.onReconnectingCbs) cb(c);
      },
    });
    this.hubs.set(opts.credentials.agent_id, conn);
    for (const [type, handler] of this.messageHandlers) {
      this.wireHandler(conn, type, handler);
    }
    await conn.start();
    return conn;
  }

  /** Close and remove a single hub by agent_id. No-op if unknown. */
  async removeHub(agentId: string): Promise<void> {
    const conn = this.hubs.get(agentId);
    if (!conn) return;
    conn.close();
    this.hubs.delete(agentId);
  }

  get(agentId: string): HubConnection | undefined {
    return this.hubs.get(agentId);
  }

  all(): HubConnection[] {
    return Array.from(this.hubs.values());
  }

  connected(): HubConnection[] {
    return this.all().filter((c) => c.isConnected());
  }

  size(): number {
    return this.hubs.size;
  }

  /** Send a message to every connected hub. Hubs that are disconnected are skipped. */
  broadcast(msg: WsMessage): void {
    for (const conn of this.hubs.values()) {
      if (conn.isConnected()) conn.send(msg);
    }
  }

  closeAll(): void {
    for (const conn of this.hubs.values()) conn.close();
    this.hubs.clear();
  }

  private wireHandler(conn: HubConnection, type: string, handler: HubMessageHandler): void {
    conn.client.onMessage(type, (msg) => handler(msg, conn));
  }
}

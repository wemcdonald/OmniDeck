import { AgentClient, type AgentClientOptions } from "./client.js";
import type { WsMessage } from "./protocol.js";
import type { AgentCredentials } from "../credentials.js";
import type { HubResolver, HubEndpoint } from "../mdns-resolver.js";
import { createLogger } from "../logger.js";

const log = createLogger("hub-conn");

export type HubMessageHandler = (msg: WsMessage, conn: HubConnection) => void | Promise<void>;

type BaseClientOptions = Omit<AgentClientOptions, "hubUrl" | "auth" | "caCert">;

/**
 * One live (or pending) connection to a single paired hub. Two behaviours:
 *
 *  - **Fingerprint mode** (when the credentials entry has a
 *    `cert_fingerprint_sha256`): delays the first connect until the resolver
 *    observes a hub with that fingerprint on the local network. If the hub
 *    disappears, the socket is left to close naturally; on next appearance a
 *    fresh connect is attempted.
 *  - **Direct-URL mode** (legacy creds without a fingerprint): dials
 *    `hub_address` immediately and relies on AgentClient's built-in 5s
 *    reconnect loop.
 */
export class HubConnection {
  readonly agentId: string;
  readonly credentials: AgentCredentials;
  client: AgentClient;
  private connected = false;
  private connecting = false;
  private resolver: HubResolver | undefined;
  private baseClientOptions: BaseClientOptions;
  private lifecycleCallbacks: {
    onConnected?: (conn: HubConnection) => void;
    onDisconnected?: (conn: HubConnection, reason: string) => void;
    onReconnecting?: (conn: HubConnection) => void;
  };
  private unsubscribeUp?: () => void;

  constructor(opts: {
    credentials: AgentCredentials;
    clientOptions: BaseClientOptions;
    resolver?: HubResolver;
    onConnected?: (conn: HubConnection) => void;
    onDisconnected?: (conn: HubConnection, reason: string) => void;
    onReconnecting?: (conn: HubConnection) => void;
  }) {
    this.agentId = opts.credentials.agent_id;
    this.credentials = opts.credentials;
    this.baseClientOptions = opts.clientOptions;
    this.resolver = opts.resolver;
    this.lifecycleCallbacks = {
      onConnected: opts.onConnected,
      onDisconnected: opts.onDisconnected,
      onReconnecting: opts.onReconnecting,
    };
    this.client = this.buildClient(opts.credentials.hub_address);
  }

  private buildClient(hubUrl: string): AgentClient {
    return new AgentClient({
      ...this.baseClientOptions,
      hubUrl,
      auth: { agentId: this.credentials.agent_id, token: this.credentials.token },
      caCert: this.credentials.ca_cert,
      onConnected: () => {
        log.info("HubConnection.onConnected fired", {
          agentId: this.agentId,
          hub: this.credentials.hub_name,
          wasConnected: this.connected,
        });
        this.connected = true;
        this.lifecycleCallbacks.onConnected?.(this);
      },
      onDisconnected: (reason) => {
        log.info("HubConnection.onDisconnected fired", {
          agentId: this.agentId,
          hub: this.credentials.hub_name,
          reason,
          wasConnected: this.connected,
        });
        this.connected = false;
        this.lifecycleCallbacks.onDisconnected?.(this, reason);
      },
      onReconnecting: () => {
        this.lifecycleCallbacks.onReconnecting?.(this);
      },
    });
  }

  async start(): Promise<void> {
    const fingerprint = this.credentials.cert_fingerprint_sha256;
    if (!fingerprint || !this.resolver) {
      // Direct-URL mode: dial immediately.
      await this.safeConnect();
      return;
    }

    // Fingerprint mode: wait for the resolver to observe the hub.
    const current = this.resolver.get(fingerprint);
    if (current) {
      this.updateUrlFromEndpoint(current);
      await this.safeConnect();
    } else {
      log.info("Waiting for hub via mDNS", {
        agentId: this.agentId,
        hub: this.credentials.hub_name,
        fp: fingerprint.slice(0, 16),
      });
    }

    this.unsubscribeUp = this.resolver.onUp(fingerprint, (ep) => {
      this.updateUrlFromEndpoint(ep);
      if (!this.connected && !this.connecting) void this.safeConnect();
    });
  }

  private updateUrlFromEndpoint(ep: HubEndpoint): void {
    const url = `wss://${ep.address}:${ep.port}`;
    if (this.client.hubUrl !== url) {
      log.info("Updating hub URL from mDNS", {
        agentId: this.agentId,
        hub: this.credentials.hub_name,
        from: this.client.hubUrl,
        to: url,
      });
      this.client.hubUrl = url;
    }
  }

  private async safeConnect(): Promise<void> {
    if (this.connecting || this.connected) return;
    this.connecting = true;
    try {
      await this.client.connect();
    } catch (err) {
      log.debug("Connect attempt failed", { agentId: this.agentId, err: String(err) });
    } finally {
      this.connecting = false;
    }
  }

  send(msg: WsMessage): void {
    this.client.send(msg);
  }

  sendResponse(type: string, data: unknown, id?: string): void {
    this.client.sendResponse(type, data, id);
  }

  close(): void {
    this.unsubscribeUp?.();
    this.unsubscribeUp = undefined;
    this.client.close();
  }

  isConnected(): boolean {
    return this.connected;
  }
}

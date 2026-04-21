import { AgentClient, type AgentClientOptions } from "./client.js";
import type { WsMessage } from "./protocol.js";
import type { AgentCredentials } from "../credentials.js";

export type HubMessageHandler = (msg: WsMessage, conn: HubConnection) => void | Promise<void>;

/**
 * One live connection to a single paired hub. Wraps an AgentClient and carries
 * the pairing record (agent_id, hub name, fingerprint etc.) used by the
 * HubConnectionManager to identify it.
 */
export class HubConnection {
  readonly agentId: string;
  readonly credentials: AgentCredentials;
  readonly client: AgentClient;
  private connected = false;

  constructor(opts: {
    credentials: AgentCredentials;
    clientOptions: Omit<AgentClientOptions, "hubUrl" | "auth" | "caCert">;
    onConnected?: (conn: HubConnection) => void;
    onDisconnected?: (conn: HubConnection, reason: string) => void;
    onReconnecting?: (conn: HubConnection) => void;
  }) {
    this.agentId = opts.credentials.agent_id;
    this.credentials = opts.credentials;

    this.client = new AgentClient({
      ...opts.clientOptions,
      hubUrl: opts.credentials.hub_address,
      auth: { agentId: opts.credentials.agent_id, token: opts.credentials.token },
      caCert: opts.credentials.ca_cert,
      onConnected: () => {
        this.connected = true;
        opts.onConnected?.(this);
      },
      onDisconnected: (reason) => {
        this.connected = false;
        opts.onDisconnected?.(this, reason);
      },
      onReconnecting: () => {
        opts.onReconnecting?.(this);
      },
    });
  }

  async start(): Promise<void> {
    await this.client.connect();
  }

  send(msg: WsMessage): void {
    this.client.send(msg);
  }

  sendResponse(type: string, data: unknown, id?: string): void {
    this.client.sendResponse(type, data, id);
  }

  close(): void {
    this.client.close();
  }

  isConnected(): boolean {
    return this.connected;
  }
}

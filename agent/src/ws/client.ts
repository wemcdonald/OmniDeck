import { createMessage, parseMessage, type WsMessage } from "./protocol.js";
import { createLogger } from "../logger.js";

const log = createLogger("ws");

const RECONNECT_DELAY_MS = 5000;

export interface AgentClientOptions {
  hubUrl: string;
  hostname: string;
  platform: string;
  agentVersion: string;
  /** PEM CA certificate for TLS verification (pinned during pairing) */
  caCert?: string;
  /** Auth credentials for token-based authentication */
  auth?: { agentId: string; token: string };
  /** Lifecycle callbacks for the Tauri shell */
  onConnected?: () => void;
  onDisconnected?: (reason: string) => void;
  onReconnecting?: () => void;
}

type MessageHandler = (msg: WsMessage) => void | Promise<void>;

export class AgentClient {
  private ws: WebSocket | null = null;
  private opts: AgentClientOptions;
  private handlers = new Map<string, MessageHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Tracks whether close() was explicitly called to suppress auto-reconnect */
  private closing = false;

  constructor(opts: AgentClientOptions) {
    this.opts = opts;
  }

  createHelloMessage(): WsMessage {
    return createMessage("state_update", {
      hostname: this.opts.hostname,
      platform: this.opts.platform,
      agent_version: this.opts.agentVersion,
    });
  }

  onMessage(type: string, handler: MessageHandler): void {
    this.handlers.set(type, handler);
  }

  async connect(): Promise<void> {
    this.closing = false;
    return new Promise((resolve, reject) => {
      // Build WebSocket options for TLS
      const wsOpts: Record<string, unknown> = {};
      if (this.opts.hubUrl.startsWith("wss://")) {
        if (this.opts.caCert) {
          // Pin the CA cert for TLS verification
          wsOpts.tls = { ca: this.opts.caCert, rejectUnauthorized: true };
        } else {
          // No CA cert yet (first boot before pairing) — accept self-signed
          wsOpts.tls = { rejectUnauthorized: false };
        }
      }

      // Bun's WebSocket supports a second options argument for TLS
      // Node's WebSocket does not, but we handle both
      try {
        this.ws = Object.keys(wsOpts).length > 0
          ? new WebSocket(this.opts.hubUrl, wsOpts as unknown as string[])
          : new WebSocket(this.opts.hubUrl);
      } catch {
        // Fallback: if options not supported, connect without them
        this.ws = new WebSocket(this.opts.hubUrl);
      }

      this.ws.onopen = () => {
        log.info("Connected to hub", { url: this.opts.hubUrl });

        if (this.opts.auth) {
          // Send authenticate message first
          const authMsg = createMessage("authenticate", {
            agent_id: this.opts.auth.agentId,
            token: this.opts.auth.token,
          });
          this.send(authMsg);
        } else {
          // No auth — send hello directly (pairing flow or legacy)
          this.send(this.createHelloMessage());
          this.opts.onConnected?.();
        }
        resolve();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const raw =
            typeof event.data === "string" ? event.data : String(event.data);
          const msg = parseMessage(raw);
          log.debug(`← ${msg.type}`, { id: msg.id });

          // Handle authenticate_response: send hello after successful auth
          if (msg.type === "authenticate_response") {
            const data = msg.data as { success: boolean; error?: string };
            if (data.success) {
              log.info("Authentication successful");
              this.send(this.createHelloMessage());
              this.opts.onConnected?.();
            } else {
              log.error("Authentication failed", { error: data.error });
              // Trigger auth_failed handler if registered
              const handler = this.handlers.get("auth_failed");
              if (handler) {
                Promise.resolve(handler(msg)).catch((err: unknown) =>
                  log.error("Handler error", { type: "auth_failed", err: String(err) }),
                );
              }
              return;
            }
          }

          // Handle pair_response
          if (msg.type === "pair_response") {
            const handler = this.handlers.get("pair_response");
            if (handler) {
              Promise.resolve(handler(msg)).catch((err: unknown) =>
                log.error("Handler error", { type: "pair_response", err: String(err) }),
              );
            }
            return;
          }

          const handler = this.handlers.get(msg.type);
          if (handler) {
            Promise.resolve(handler(msg)).catch((err: unknown) =>
              log.error("Handler error", { type: msg.type, err: String(err) }),
            );
          } else {
            log.warn("No handler for message type", { type: msg.type });
          }
        } catch (err) {
          log.error("Parse error", { err: String(err) });
        }
      };

      this.ws.onerror = (event: Event) => {
        log.error("WebSocket error", { url: this.opts.hubUrl, event: String(event) });
        // Only reject on initial connect attempt; after that, let onclose handle it.
        reject(new Error(`WebSocket error connecting to ${this.opts.hubUrl}`));
      };

      this.ws.onclose = () => {
        log.warn("Disconnected from hub");
        this.opts.onDisconnected?.(this.closing ? "shutdown" : "connection_lost");
        if (!this.closing) {
          this.scheduleReconnect();
        }
      };
    });
  }

  send(msg: WsMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      log.debug(`→ ${msg.type}`, { id: msg.id });
      this.ws.send(JSON.stringify(msg));
    } else {
      log.warn("Cannot send — WebSocket not open", { type: msg.type });
    }
  }

  sendResponse(type: string, data: unknown, id?: string): void {
    this.send(createMessage(type, data, id));
  }

  /** Send a pair_request message (used during first-time pairing). */
  sendPairRequest(pairingCode: string): void {
    this.send(
      createMessage("pair_request", {
        hostname: this.opts.hostname,
        platform: this.opts.platform,
        agent_version: this.opts.agentVersion,
        pairing_code: pairingCode,
      }),
    );
  }

  close(): void {
    this.closing = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
  }

  private scheduleReconnect(): void {
    log.info(`Reconnecting in ${RECONNECT_DELAY_MS}ms…`);
    this.opts.onReconnecting?.();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err: unknown) =>
        log.error("Reconnect failed", { err: String(err) }),
      );
    }, RECONNECT_DELAY_MS);
  }
}

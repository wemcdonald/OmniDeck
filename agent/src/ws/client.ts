import { createMessage, parseMessage, type WsMessage } from "./protocol.js";
import { WS_CLOSE_CODE_REVOKED } from "./protocol.js";
import { createLogger } from "../logger.js";

const log = createLogger("ws");

const RECONNECT_DELAY_MS = 5000;
// Watchdog: if the hub calls ws.terminate() (abrupt close), Bun may not fire
// onclose. Poll readyState every WATCHDOG_INTERVAL_MS; if the socket is dead
// and no reconnect is already scheduled, kick one off.
const WATCHDOG_INTERVAL_MS = 5000;
// Heartbeat timeout: hub pings every 15s. If we haven't seen any inbound
// message in this window, assume the socket is silently dead (Wi-Fi hop,
// laptop sleep/wake, hard hub kill — cases where readyState stays OPEN
// because TCP never delivered FIN) and force a reconnect.
const HEARTBEAT_TIMEOUT_MS = 30_000;

export interface AgentClientOptions {
  hubUrl: string;
  hostname: string;
  deviceName: string;
  platform: string;
  agentVersion: string;
  /** PEM CA certificate for TLS verification (pinned during pairing) */
  caCert?: string;
  /** Auth credentials for token-based authentication */
  auth?: { agentId: string; token: string };
  /** Skip sending hello on connect (pairing flow sends pair_request first) */
  skipHelloOnConnect?: boolean;
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
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  /** Tracks whether close() was explicitly called to suppress auto-reconnect */
  private closing = false;
  /** Wall-clock of the last inbound message. Reset on each successful open
   *  and updated in onmessage. Watchdog uses this to detect silent TCP
   *  black-holes where readyState stays OPEN after the connection is dead. */
  private lastMessageAt = 0;
  /** agent_id for the connection, used in log lines to disambiguate hubs in
   *  the multi-hub case. Undefined during pairing (no auth yet). */
  private get logAgentId(): string | undefined {
    return this.opts.auth?.agentId;
  }

  constructor(opts: AgentClientOptions) {
    this.opts = opts;
  }

  /** Current hub URL. May be mutated between connect attempts to follow
   *  mDNS re-resolution when the hub's address changes. */
  get hubUrl(): string {
    return this.opts.hubUrl;
  }

  set hubUrl(url: string) {
    this.opts.hubUrl = url;
  }

  createHelloMessage(): WsMessage {
    return createMessage("state_update", {
      hostname: this.opts.hostname,
      device_name: this.opts.deviceName,
      platform: this.opts.platform,
      agent_version: this.opts.agentVersion,
    });
  }

  onMessage(type: string, handler: MessageHandler): void {
    if (this.handlers.has(type)) {
      log.warn("Overwriting existing handler for message type", { type });
    }
    this.handlers.set(type, handler);
  }

  async connect(): Promise<void> {
    this.closing = false;
    // A pending reconnect timer and an explicit connect() would race two
    // sockets. Cancel the timer; this call takes precedence.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    log.info("connect() called", { agentId: this.logAgentId, url: this.opts.hubUrl });
    return new Promise((resolve, reject) => {
      // TLS handling for self-signed certs:
      // During pairing (no CA cert yet) we disable TLS verification so the
      // agent can reach a freshly-provisioned hub it hasn't trusted yet.
      // After pairing, the pinned CA cert is passed directly to Bun's
      // WebSocket TLS options — no env var manipulation needed.
      if (this.opts.hubUrl.startsWith("wss://") && !this.opts.caCert) {
        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
      } else {
        delete process.env["NODE_TLS_REJECT_UNAUTHORIZED"];
      }

      // Silence stale events from the previous WebSocket before replacing it.
      // Bun may fire onclose late (after a server-side terminate()), which would
      // emit a "disconnected" status after the new connection already succeeded
      // and flip the tray back to "Offline". Nulling handlers prevents that,
      // and close() releases the underlying socket so it doesn't leak.
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.onopen = null;
        try { this.ws.close(); } catch { /* already closing */ }
      }

      // Pass pinned CA cert via Bun's WebSocket TLS extension
      const wsOptions = this.opts.caCert
        ? ({ tls: { ca: this.opts.caCert } } as unknown as string[])
        : undefined;
      this.ws = new WebSocket(this.opts.hubUrl, wsOptions);

      this.ws.onopen = () => {
        log.info("WS open", { agentId: this.logAgentId, url: this.opts.hubUrl });
        this.lastMessageAt = Date.now();
        this.startWatchdog();

        if (this.opts.auth) {
          // Send authenticate message first
          const authMsg = createMessage("authenticate", {
            agent_id: this.opts.auth.agentId,
            token: this.opts.auth.token,
          });
          this.send(authMsg);
        } else if (!this.opts.skipHelloOnConnect) {
          // No auth and not pairing — send hello directly
          this.send(this.createHelloMessage());
          this.opts.onConnected?.();
        }
        // If skipHelloOnConnect, the caller (Agent) will send pair_request first
        resolve();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        // Any inbound message is proof the socket is alive. Reset the
        // heartbeat clock before parsing so even malformed frames count.
        this.lastMessageAt = Date.now();
        try {
          const raw =
            typeof event.data === "string" ? event.data : String(event.data);
          const msg = parseMessage(raw);
          log.debug(`← ${msg.type}`, { id: msg.id });

          // Handle hub ping — reply immediately with pong
          if (msg.type === "ping") {
            this.send(createMessage("pong", {}));
            return;
          }

          // Handle authenticate_response: send hello after successful auth
          if (msg.type === "authenticate_response") {
            const data = msg.data as { success: boolean; error?: string };
            if (data.success) {
              log.info("Authentication successful — firing onConnected", { agentId: this.logAgentId });
              this.send(this.createHelloMessage());
              this.opts.onConnected?.();
            } else {
              log.error("Authentication failed", { agentId: this.logAgentId, error: data.error });
              // Trigger auth_failed handler if registered
              const handler = this.handlers.get("auth_failed");
              if (handler) {
                Promise.resolve(handler(msg)).catch((err: unknown) =>
                  log.error("Handler error", { type: "auth_failed", err: String(err) }),
                );
              }
            }
            return;
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

      this.ws.onclose = (event: CloseEvent) => {
        log.warn("Disconnected from hub", {
          agentId: this.logAgentId,
          code: event.code,
          reason: event.reason,
        });
        if (event.code === WS_CLOSE_CODE_REVOKED) {
          this.opts.onDisconnected?.("revoked");
          // Do not reconnect — credentials are invalid.
          return;
        }
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
        device_name: this.opts.deviceName,
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
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.ws?.close();
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) return;
    this.watchdogTimer = setInterval(() => {
      if (this.closing) return;
      const state = this.ws?.readyState;
      // CLOSING=2, CLOSED=3 — connection is dead without onclose having
      // triggered a reconnect (Bun bug with server-side terminate()).
      if ((state === 2 || state === 3) && !this.reconnectTimer) {
        log.warn("Watchdog: WS dead without onclose firing — forcing reconnect", {
          agentId: this.logAgentId,
          state,
        });
        this.forceReconnect();
        return;
      }
      // Heartbeat timeout — socket may still claim OPEN, but no traffic in
      // HEARTBEAT_TIMEOUT_MS means TCP is black-holed. Force-close and retry.
      if (state === 1 && this.lastMessageAt > 0) {
        const idleMs = Date.now() - this.lastMessageAt;
        if (idleMs > HEARTBEAT_TIMEOUT_MS && !this.reconnectTimer) {
          log.warn("Watchdog: heartbeat timeout — forcing reconnect", {
            agentId: this.logAgentId,
            idleMs,
            timeoutMs: HEARTBEAT_TIMEOUT_MS,
          });
          this.forceReconnect();
        }
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  /** Tear the current socket down so its onclose schedules a reconnect.
   *  If onclose doesn't fire (the very case that got us here), schedule one
   *  directly so we never deadlock. */
  private forceReconnect(): void {
    try { this.ws?.close(); } catch { /* already closing */ }
    // Even if close() ends up firing onclose, scheduleReconnect is idempotent
    // against a pending timer — connect() cancels it at the top.
    if (!this.reconnectTimer) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    log.info(`Reconnecting in ${RECONNECT_DELAY_MS}ms…`, { agentId: this.logAgentId });
    this.opts.onReconnecting?.();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err: unknown) =>
        log.error("Reconnect failed", { agentId: this.logAgentId, err: String(err) }),
      );
    }, RECONNECT_DELAY_MS);
  }
}

import { createMessage, parseMessage, type WsMessage } from "./protocol.js";
import { createLogger } from "../logger.js";

const log = createLogger("ws");

const RECONNECT_DELAY_MS = 5000;

export interface AgentClientOptions {
  hubUrl: string;
  hostname: string;
  platform: string;
  agentVersion: string;
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
      this.ws = new WebSocket(this.opts.hubUrl);

      this.ws.onopen = () => {
        log.info("Connected to hub", { url: this.opts.hubUrl });
        this.send(this.createHelloMessage());
        resolve();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const raw =
            typeof event.data === "string" ? event.data : String(event.data);
          const msg = parseMessage(raw);
          log.debug(`← ${msg.type}`, { id: msg.id });
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
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err: unknown) =>
        log.error("Reconnect failed", { err: String(err) }),
      );
    }, RECONNECT_DELAY_MS);
  }
}

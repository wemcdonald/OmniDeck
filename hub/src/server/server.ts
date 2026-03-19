import { WebSocketServer, WebSocket } from "ws";
import {
  createMessage,
  parseMessage,
  type WsMessage,
  type AgentStateData,
  type CommandResponseData,
} from "./protocol.js";
import { createLogger } from "../logger.js";
import { randomUUID } from "node:crypto";

const log = createLogger("server");

interface ConnectedAgent {
  ws: WebSocket;
  hostname: string;
  platform: string;
  state: AgentStateData;
}

interface PendingCommand {
  resolve: (data: CommandResponseData) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PluginRegistryLike {
  getDistributionList(platform: string): Array<{ id: string; version: string; sha256: string; platforms: string[]; hasAgent: boolean }>;
  getAgentBundle(id: string): { code: string; sha256: string } | undefined;
}

interface AgentServerOptions {
  port: number;
  registry?: PluginRegistryLike;
}

type AgentStateCallback = (hostname: string, state: AgentStateData) => void;
type AgentConnectionCallback = (hostname: string, connected: boolean) => void;

export class AgentServer {
  private wss: WebSocketServer | null = null;
  private agents = new Map<string, ConnectedAgent>();
  private pendingCommands = new Map<string, PendingCommand>();
  private port: number;
  private registry: PluginRegistryLike | undefined;
  private stateCallbacks: AgentStateCallback[] = [];
  private connectionCallbacks: AgentConnectionCallback[] = [];

  constructor(opts: AgentServerOptions) {
    this.port = opts.port;
    this.registry = opts.registry;
  }

  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        const addr = this.wss!.address();
        const port = typeof addr === "object" && addr !== null ? addr.port : this.port;
        log.info({ port }, "Agent WebSocket server started");
        resolve(port);
      });

      this.wss.on("connection", (ws) => {
        this.handleConnection(ws);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.wss) return;
    for (const agent of this.agents.values()) {
      agent.ws.close();
    }
    return new Promise((resolve) => {
      this.wss!.close(() => resolve());
    });
  }

  getConnectedAgents(): AgentStateData[] {
    return Array.from(this.agents.values()).map((a) => a.state);
  }

  getAgent(hostname: string): ConnectedAgent | undefined {
    return this.agents.get(hostname);
  }

  /** Register a callback for agent state updates (fired on each state_update message). */
  onAgentStateUpdate(cb: AgentStateCallback): void {
    this.stateCallbacks.push(cb);
  }

  /** Register a callback for agent connect/disconnect events. */
  onAgentConnection(cb: AgentConnectionCallback): void {
    this.connectionCallbacks.push(cb);
  }

  async sendCommand(
    hostname: string,
    command: string,
    params: Record<string, unknown>,
    timeoutMs = 5000,
  ): Promise<CommandResponseData> {
    const agent = this.agents.get(hostname);
    if (!agent) throw new Error(`Agent not connected: ${hostname}`);

    const id = randomUUID();
    const msg = createMessage("command", { command, params } satisfies { command: string; params: Record<string, unknown> }, id);
    agent.ws.send(JSON.stringify(msg));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`Command timeout: ${command} on ${hostname}`));
      }, timeoutMs);
      this.pendingCommands.set(id, { resolve, reject, timer });
    });
  }

  private handleConnection(ws: WebSocket): void {
    let agentHostname: string | undefined;

    ws.on("message", (data) => {
      try {
        const msg = parseMessage(data.toString());
        this.handleMessage(ws, msg, (hostname) => {
          agentHostname = hostname;
        });
      } catch (err) {
        log.error({ err }, "Failed to parse message");
      }
    });

    ws.on("close", () => {
      if (agentHostname) {
        this.agents.delete(agentHostname);
        log.info({ hostname: agentHostname }, "Agent disconnected");
        for (const cb of this.connectionCallbacks) cb(agentHostname, false);
      }
    });

    ws.on("error", (err) => {
      log.error({ err, hostname: agentHostname }, "WebSocket error");
    });
  }

  private handleMessage(
    ws: WebSocket,
    msg: WsMessage,
    setHostname: (h: string) => void,
  ): void {
    switch (msg.type) {
      case "state_update": {
        const state = msg.data as AgentStateData;
        const isNew = !this.agents.has(state.hostname);
        setHostname(state.hostname);
        this.agents.set(state.hostname, {
          ws,
          hostname: state.hostname,
          platform: state.platform,
          state,
        });
        if (isNew) {
          for (const cb of this.connectionCallbacks) cb(state.hostname, true);
        }
        for (const cb of this.stateCallbacks) cb(state.hostname, state);
        if (this.registry) {
          const plugins = this.registry.getDistributionList(state.platform);
          ws.send(JSON.stringify(createMessage("plugin_manifest", { plugins })));
        }
        break;
      }
      case "plugin_download_request": {
        const { id } = msg.data as { id: string };
        if (this.registry) {
          const bundle = this.registry.getAgentBundle(id);
          if (bundle) {
            ws.send(JSON.stringify(createMessage("plugin_download_response", { id, code: bundle.code, sha256: bundle.sha256 }, msg.id)));
          } else {
            log.warn({ id }, "Plugin bundle not found");
          }
        }
        break;
      }
      case "plugin_status": {
        log.info({ data: msg.data }, "Plugin status received");
        break;
      }
      case "command_response": {
        const pending = this.pendingCommands.get(msg.id!);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingCommands.delete(msg.id!);
          pending.resolve(msg.data as CommandResponseData);
        }
        break;
      }
      case "pair_request": {
        log.info({ data: msg.data }, "Pairing request received");
        // TODO: implement pairing flow
        break;
      }
      default:
        log.warn({ type: msg.type }, "Unknown message type");
    }
  }
}

import { createServer as createHttpsServer } from "node:https";
import { WebSocketServer, WebSocket } from "ws";
import {
  createMessage,
  parseMessage,
  type WsMessage,
  type AgentStateData,
  type CommandResponseData,
  type PairRequestData,
  type PairResponseData,
  type AuthenticateData,
  type AuthenticateResponseData,
  type PluginLogData,
} from "./protocol.js";
import type { PairingManager } from "./pairing.js";
import { createLogger } from "../logger.js";
import { randomUUID } from "node:crypto";

const log = createLogger("server");

interface ConnectedAgent {
  ws: WebSocket;
  hostname: string;
  platform: string;
  state: AgentStateData;
  agentId?: string;
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
  tls?: { cert: Buffer; key: Buffer };
  pairing?: PairingManager;
  /** CA cert PEM to send to agents during pairing */
  caCert?: string;
  caFingerprint?: string;
  hubName?: string;
}

type AgentStateCallback = (hostname: string, state: AgentStateData) => void;
type PluginStateCallback = (hostname: string, pluginId: string, key: string, value: unknown) => void;
type AgentConnectionCallback = (hostname: string, connected: boolean) => void;

/** Per-connection auth state */
interface ConnectionState {
  authenticated: boolean;
  agentId?: string;
}

export class AgentServer {
  private wss: WebSocketServer | null = null;
  private httpsServer: ReturnType<typeof createHttpsServer> | null = null;
  private agents = new Map<string, ConnectedAgent>();
  private pendingCommands = new Map<string, PendingCommand>();
  private agentLoggers = new Map<string, ReturnType<typeof createLogger>>();
  private connectionStates = new Map<WebSocket, ConnectionState>();
  private port: number;
  private registry: PluginRegistryLike | undefined;
  private tls: AgentServerOptions["tls"];
  private pairing: PairingManager | undefined;
  private caCert: string | undefined;
  private caFingerprint: string | undefined;
  private hubName: string | undefined;
  private stateCallbacks: AgentStateCallback[] = [];
  private pluginStateCallbacks: PluginStateCallback[] = [];
  private connectionCallbacks: AgentConnectionCallback[] = [];

  constructor(opts: AgentServerOptions) {
    this.port = opts.port;
    this.registry = opts.registry;
    this.tls = opts.tls;
    this.pairing = opts.pairing;
    this.caCert = opts.caCert;
    this.caFingerprint = opts.caFingerprint;
    this.hubName = opts.hubName;
  }

  async start(): Promise<number> {
    return new Promise((resolve) => {
      if (this.tls) {
        // TLS-backed WebSocket server
        this.httpsServer = createHttpsServer({
          cert: this.tls.cert,
          key: this.tls.key,
        });
        this.wss = new WebSocketServer({ server: this.httpsServer });
        this.httpsServer.listen(this.port, "0.0.0.0", () => {
          log.info({ port: this.port, tls: true }, "Agent WebSocket server started (wss://)");
          resolve(this.port);
        });
      } else {
        // Plain WebSocket server (dev mode)
        this.wss = new WebSocketServer({ port: this.port }, () => {
          const addr = this.wss!.address();
          const port = typeof addr === "object" && addr !== null ? addr.port : this.port;
          log.info({ port, tls: false }, "Agent WebSocket server started (ws://)");
          resolve(port);
        });
      }

      this.wss.on("connection", (ws) => {
        this.handleConnection(ws);
      });
    });
  }

  async stop(): Promise<void> {
    for (const agent of this.agents.values()) {
      agent.ws.close();
    }
    if (this.wss) {
      await new Promise<void>((resolve) => this.wss!.close(() => resolve()));
    }
    if (this.httpsServer) {
      await new Promise<void>((resolve) => this.httpsServer!.close(() => resolve()));
    }
  }

  getConnectedAgents(): AgentStateData[] {
    return Array.from(this.agents.values()).map((a) => a.state);
  }

  getAgent(hostname: string): ConnectedAgent | undefined {
    return this.agents.get(hostname);
  }

  private getHostnameByAgentId(agentId: string): string | undefined {
    for (const [hostname, agent] of this.agents) {
      if (agent.agentId === agentId) return hostname;
    }
    return undefined;
  }

  /** Register a callback for agent state updates (fired on each state_update message). */
  onAgentStateUpdate(cb: AgentStateCallback): void {
    this.stateCallbacks.push(cb);
  }

  /** Register a callback for plugin state updates from agents. */
  onPluginState(cb: PluginStateCallback): void {
    this.pluginStateCallbacks.push(cb);
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

    // Start unauthenticated — if no pairing manager, auto-authenticate
    const connState: ConnectionState = {
      authenticated: !this.pairing,
    };
    this.connectionStates.set(ws, connState);

    log.info({ authenticated: connState.authenticated }, "New agent connection");

    ws.on("message", (data) => {
      try {
        const msg = parseMessage(data.toString());
        this.handleMessage(ws, msg, connState, (hostname) => {
          agentHostname = hostname;
        });
      } catch (err) {
        log.error({ err }, "Failed to parse message");
      }
    });

    ws.on("close", () => {
      this.connectionStates.delete(ws);
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
    connState: ConnectionState,
    setHostname: (h: string) => void,
  ): void {
    // Auth gating: before authentication, only allow pair_request and authenticate
    if (!connState.authenticated) {
      if (msg.type === "pair_request") {
        this.handlePairRequest(ws, msg, connState);
        return;
      }
      if (msg.type === "authenticate") {
        this.handleAuthenticate(ws, msg, connState);
        return;
      }
      // Don't close the connection — just drop the message.
      // Closing triggers reconnect loops where the agent can never recover.
      log.warn({ type: msg.type }, "Unauthenticated message dropped (waiting for auth)");
      return;
    }

    log.debug({ type: msg.type, authenticated: connState.authenticated, agentId: connState.agentId }, "Processing authenticated message");

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
          agentId: connState.agentId,
        });
        if (isNew) {
          for (const cb of this.connectionCallbacks) cb(state.hostname, true);
          // Update last seen
          if (connState.agentId && this.pairing) {
            this.pairing.updateLastSeen(connState.agentId);
          }
          // Send plugin manifest only on first connect
          if (this.registry) {
            const plugins = this.registry.getDistributionList(state.platform);
            ws.send(JSON.stringify(createMessage("plugin_manifest", { plugins })));
          }
        }
        for (const cb of this.stateCallbacks) cb(state.hostname, state);
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
        log.debug({ data: msg.data }, "Plugin status received");
        break;
      }
      case "plugin_log": {
        const d = msg.data as PluginLogData;
        const key = `agent:${d.hostname}:${d.pluginId}`;
        let agentLogger = this.agentLoggers.get(key);
        if (!agentLogger) {
          agentLogger = createLogger(key);
          this.agentLoggers.set(key, agentLogger);
        }
        const logData = d.data ? { ...d.data } : {};
        switch (d.level) {
          case "warn": agentLogger.warn(logData, d.msg); break;
          case "error": agentLogger.error(logData, d.msg); break;
          default: agentLogger.info(logData, d.msg); break;
        }
        break;
      }
      case "plugin_state": {
        const { pluginId, key, value } = msg.data as { pluginId: string; key: string; value: unknown };
        const hostname = connState.agentId ? this.getHostnameByAgentId(connState.agentId) : undefined;
        if (hostname) {
          for (const cb of this.pluginStateCallbacks) cb(hostname, pluginId, key, value);
        }
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
        // Already authenticated — ignore duplicate pair requests
        log.warn("Pair request from already-authenticated agent, ignoring");
        break;
      }
      default:
        log.warn({ type: msg.type }, "Unknown message type");
    }
  }

  private handlePairRequest(
    ws: WebSocket,
    msg: WsMessage,
    connState: ConnectionState,
  ): void {
    if (!this.pairing) {
      // No pairing manager — auto-accept (shouldn't reach here but be safe)
      connState.authenticated = true;
      return;
    }

    const data = msg.data as PairRequestData;
    log.info({ hostname: data.hostname, platform: data.platform }, "Pairing request received");

    if (!this.pairing.validateAndConsumeCode(data.pairing_code)) {
      log.warn({ code: data.pairing_code }, "Invalid or expired pairing code");
      const response: PairResponseData = {
        success: false,
        error: "Invalid or expired pairing code",
      };
      ws.send(JSON.stringify(createMessage("pair_response", response, msg.id)));
      ws.close(4002, "Invalid pairing code");
      return;
    }

    const { agentId, token } = this.pairing.registerAgent(
      data.hostname,
      data.platform,
    );

    connState.authenticated = true;
    log.info({ agentId, hostname: data.hostname, authenticated: connState.authenticated }, "Connection authenticated after pairing");
    connState.agentId = agentId;

    const response: PairResponseData = {
      success: true,
      agent_id: agentId,
      token,
      ca_cert: this.caCert,
      ca_fingerprint: this.caFingerprint,
      hub_name: this.hubName,
    };
    ws.send(JSON.stringify(createMessage("pair_response", response, msg.id)));
    log.info({ agentId, hostname: data.hostname }, "Agent paired successfully");
  }

  private handleAuthenticate(
    ws: WebSocket,
    msg: WsMessage,
    connState: ConnectionState,
  ): void {
    if (!this.pairing) {
      connState.authenticated = true;
      return;
    }

    const data = msg.data as AuthenticateData;
    const agent = this.pairing.authenticateAgent(data.token);

    if (!agent) {
      const response: AuthenticateResponseData = {
        success: false,
        error: "Invalid token — agent may have been revoked",
      };
      ws.send(JSON.stringify(createMessage("authenticate_response", response, msg.id)));
      ws.close(4003, "Authentication failed");
      return;
    }

    connState.authenticated = true;
    connState.agentId = agent.agent_id;
    this.pairing.updateLastSeen(agent.agent_id);

    const response: AuthenticateResponseData = { success: true };
    ws.send(JSON.stringify(createMessage("authenticate_response", response, msg.id)));
    log.info({ agentId: agent.agent_id, name: agent.name }, "Agent authenticated");
  }
}

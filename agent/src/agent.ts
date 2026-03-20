import { AgentClient } from "./ws/client.js";
import { createMessage, type WsMessage } from "./ws/protocol.js";
import { PluginLoader } from "./plugins/loader.js";
import {
  detectPlatform,
  getAgentHostname,
  pollSystemState,
} from "./primitives/platform.js";
import { createLogger } from "./logger.js";
import { join } from "node:path";
import { homedir } from "node:os";

const log = createLogger("agent");

import type { PairResponseData } from "./ws/protocol.js";

interface AgentOptions {
  hubUrl: string;
  hostname?: string;
  cacheDir?: string;
  stateInterval?: number;
  /** Auth credentials for reconnecting with stored token */
  auth?: { agentId: string; token: string };
  /** CA cert PEM for TLS verification */
  caCert?: string;
  /** Pairing code for first-time pairing */
  pairingCode?: string;
  /** Called when pairing succeeds */
  onPaired?: (response: PairResponseData) => void;
  /** Called when pairing fails */
  onPairFailed?: (error: string) => void;
  /** Called when token auth fails (revoked) */
  onAuthFailed?: () => void;
}

export class Agent {
  private client: AgentClient;
  private loader: PluginLoader;
  private opts: AgentOptions;
  private stateTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: AgentOptions) {
    this.opts = opts;
    const hostname = opts.hostname ?? getAgentHostname();
    const cacheDir =
      opts.cacheDir ?? join(homedir(), ".omnideck", "plugins");

    this.client = new AgentClient({
      hubUrl: opts.hubUrl,
      hostname,
      platform: detectPlatform(),
      agentVersion: "0.2.0",
      caCert: opts.caCert,
      auth: opts.auth,
    });

    this.loader = new PluginLoader(cacheDir);

    // Register WS handlers
    this.client.onMessage("plugin_manifest", (msg) => {
      log.debug("Received plugin_manifest", { plugins: (msg.data as { plugins: unknown[] }).plugins });
      return this.handlePluginManifest(msg);
    });
    this.client.onMessage("command", (msg) => {
      log.debug("Received command", msg.data as Record<string, unknown>);
      return this.handleCommand(msg);
    });
    this.client.onMessage("plugin_config_update", (msg) => {
      log.debug("Received plugin_config_update", msg.data as Record<string, unknown>);
      return this.handleConfigUpdate(msg);
    });
    this.client.onMessage("plugin_download_response", (msg) => {
      log.debug("Received plugin_download_response", { id: (msg.data as { id: string }).id });
      return this.handleDownloadResponse(msg);
    });

    // Pairing response handler
    if (opts.onPaired || opts.onPairFailed) {
      this.client.onMessage("pair_response", (msg) => {
        const data = msg.data as PairResponseData;
        if (data.success) {
          opts.onPaired?.(data);
        } else {
          opts.onPairFailed?.(data.error ?? "Unknown pairing error");
        }
      });
    }

    // Auth failure handler
    if (opts.onAuthFailed) {
      this.client.onMessage("auth_failed", () => {
        opts.onAuthFailed!();
      });
    }
  }

  async start(): Promise<void> {
    await this.client.connect();

    // If pairing, send the pair request (the hello/state_update will be sent after pair_response)
    if (this.opts.pairingCode) {
      this.client.sendPairRequest(this.opts.pairingCode);
    }

    // Start periodic state streaming (default 5 s)
    const interval = this.opts.stateInterval ?? 5000;
    this.stateTimer = setInterval(() => {
      void (async () => {
        const state = await pollSystemState();
        this.client.send(
          createMessage("state_update", {
            hostname: this.opts.hostname ?? getAgentHostname(),
            platform: detectPlatform(),
            agent_version: "0.2.0",
            active_window_app: state.activeWindowApp,
            active_window_title: state.activeWindowTitle,
            idle_time_ms: state.idleTimeMs,
            volume: state.volume,
            is_muted: state.isMuted,
            mic_volume: state.micVolume,
            mic_muted: state.micMuted,
          }),
        );
      })();
    }, interval);

    log.info("Agent running");
  }

  async stop(): Promise<void> {
    if (this.stateTimer) {
      clearInterval(this.stateTimer);
      this.stateTimer = null;
    }
    await this.loader.unloadAll();
    this.client.close();
  }

  private async handlePluginManifest(msg: WsMessage): Promise<void> {
    const { plugins } = msg.data as {
      plugins: Array<{ id: string; version: string; sha256: string }>;
    };
    log.info(`Hub announced ${plugins.length} plugins`);

    const statuses: Array<{
      id: string;
      version: string;
      status: string;
      error?: string;
    }> = [];

    const hostname = this.opts.hostname ?? getAgentHostname();

    for (const plugin of plugins) {
      try {
        if (this.loader.hasCached(plugin.id, plugin.sha256)) {
          // Load from cache
          await this.loader.loadFromCache(plugin.id, {
            hostname,
            onStateUpdate: (pId, key, value) => {
              this.client.send(
                createMessage("plugin_state", { pluginId: pId, key, value }),
              );
            },
          });
          statuses.push({ id: plugin.id, version: plugin.version, status: "active" });
        } else {
          // Request download from hub
          this.client.send(
            createMessage("plugin_download_request", { id: plugin.id }),
          );
          statuses.push({
            id: plugin.id,
            version: plugin.version,
            status: "pending",
          });
        }
      } catch (err) {
        statuses.push({
          id: plugin.id,
          version: plugin.version,
          status: "failed",
          error: String(err),
        });
      }
    }

    this.client.send(createMessage("plugin_status", { plugins: statuses }));
  }

  private async handleDownloadResponse(msg: WsMessage): Promise<void> {
    const { id, code, sha256 } = msg.data as {
      id: string;
      code: string;
      sha256: string;
    };
    const hostname = this.opts.hostname ?? getAgentHostname();
    try {
      await this.loader.loadFromCode(id, code, sha256, {
        hostname,
        onStateUpdate: (pId, key, value) => {
          this.client.send(
            createMessage("plugin_state", { pluginId: pId, key, value }),
          );
        },
      });
      this.client.send(
        createMessage("plugin_status", {
          plugins: [{ id, version: "unknown", status: "active" }],
        }),
      );
      log.info(`Plugin ${id} downloaded and loaded`);
    } catch (err) {
      this.client.send(
        createMessage("plugin_status", {
          plugins: [{ id, version: "unknown", status: "failed", error: String(err) }],
        }),
      );
    }
  }

  private async handleCommand(msg: WsMessage): Promise<void> {
    const { command, params } = msg.data as {
      command: string;
      params: Record<string, unknown>;
    };

    // command format: "pluginId.actionId"
    const dotIdx = command.indexOf(".");
    if (dotIdx === -1) {
      this.client.sendResponse(
        "command_response",
        { success: false, error: `Invalid command format: ${command}` },
        msg.id,
      );
      return;
    }

    const pluginId = command.slice(0, dotIdx);
    const actionId = command.slice(dotIdx + 1);
    log.debug(`Dispatching command ${pluginId}.${actionId}`, { params });
    const plugin = this.loader.getPlugin(pluginId);

    if (!plugin) {
      log.debug(`Plugin not loaded: ${pluginId}`, { loaded: this.loader.getLoadedPluginIds() });
      this.client.sendResponse(
        "command_response",
        { success: false, error: `Plugin not loaded: ${pluginId}` },
        msg.id,
      );
      return;
    }

    const handler = plugin.actions.get(actionId);
    if (!handler) {
      log.debug(`Action not found: ${actionId}`, { available: Array.from(plugin.actions.keys()) });
      this.client.sendResponse(
        "command_response",
        { success: false, error: `Action not found: ${actionId}` },
        msg.id,
      );
      return;
    }

    try {
      const result = await handler(params);
      log.debug(`Command ${command} completed`, result as unknown as Record<string, unknown>);
      this.client.sendResponse("command_response", result, msg.id);
    } catch (err) {
      log.debug(`Command ${command} failed`, { error: String(err) });
      this.client.sendResponse(
        "command_response",
        { success: false, error: String(err) },
        msg.id,
      );
    }
  }

  private handleConfigUpdate(msg: WsMessage): void {
    const { id, config } = msg.data as {
      id: string;
      config: Record<string, unknown>;
    };
    const plugin = this.loader.getPlugin(id);
    if (plugin) {
      plugin.reloadConfig(config);
      log.info(`Config reloaded for plugin ${id}`);
    }
  }
}

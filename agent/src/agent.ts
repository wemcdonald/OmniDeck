import { AgentClient } from "./ws/client.js";
import {
  createMessage,
  type WsMessage,
  PluginManifestSchema,
  CommandSchema,
  PluginConfigUpdateSchema,
  PluginDownloadResponseSchema,
} from "./ws/protocol.js";
import { PluginLoader } from "./plugins/loader.js";
import { ensureFfi } from "./primitives/ffi.js";
import {
  detectPlatform,
  getAgentHostname,
  getDeviceName,
  getMacAddresses,
  pollSystemState,
} from "./primitives/platform.js";
import { createLogger } from "./logger.js";
import { getPluginsCacheDir } from "./config-dir.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const log = createLogger("agent");

// Read version from package.json once at startup — single source of truth
const _pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const AGENT_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(_pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

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
  /** Called when the agent connects to the hub */
  onConnected?: (hubName: string, hubUrl: string) => void;
  /** Called when the agent disconnects */
  onDisconnected?: (reason: string) => void;
  /** Called when the agent is reconnecting */
  onReconnecting?: () => void;
  /** Platform request handler (managed mode IPC to Tauri host) */
  platformRequest?: (method: string, params: Record<string, unknown>) => Promise<unknown>;
}

export class Agent {
  private client: AgentClient;
  private loader: PluginLoader;
  private opts: AgentOptions;
  private stateTimer: ReturnType<typeof setInterval> | null = null;
  /** Plugins currently being unloaded+reloaded — commands for these are rejected. */
  private loadingPlugins = new Set<string>();

  constructor(opts: AgentOptions) {
    this.opts = opts;
    const hostname = opts.hostname ?? getAgentHostname();
    const deviceName = getDeviceName();
    const cacheDir = opts.cacheDir ?? getPluginsCacheDir();

    this.client = new AgentClient({
      hubUrl: opts.hubUrl,
      hostname,
      deviceName,
      platform: detectPlatform(),
      agentVersion: AGENT_VERSION,
      caCert: opts.caCert,
      auth: opts.auth,
      skipHelloOnConnect: !!opts.pairingCode,
      onConnected: () => {
        // Start polling once authenticated (for token auth flow)
        if (!this.stateTimer) {
          this.startStatePolling();
        }
        opts.onConnected?.(opts.hubUrl, opts.hubUrl);
      },
      onDisconnected: (reason) => opts.onDisconnected?.(reason),
      onReconnecting: () => opts.onReconnecting?.(),
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
          // Now authenticated — send hello and start state polling
          this.client.send(this.client.createHelloMessage());
          this.startStatePolling();
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
    // Pre-load bun:ffi so plugins can use omnideck.ffi.open() synchronously
    await ensureFfi().catch(() => {});

    await this.client.connect();

    // If pairing, send the pair request and DON'T start state polling yet.
    // The pair_response handler will send the hello and start polling.
    if (this.opts.pairingCode) {
      this.client.sendPairRequest(this.opts.pairingCode);
      return;
    }

    // If authenticating with token, DON'T start polling yet.
    // The authenticate_response handler in AgentClient will fire onConnected,
    // which triggers startStatePolling via the callback below.
    if (this.opts.auth) {
      return;
    }

    // No auth, no pairing (legacy/dev mode) — start polling immediately
    this.startStatePolling();
  }

  private startStatePolling(): void {
    // Collect static info once
    const hostname = this.opts.hostname ?? getAgentHostname();
    const deviceName = getDeviceName();
    const platform = detectPlatform();
    const macAddresses = getMacAddresses();

    // Start periodic state streaming (default 5 s)
    const interval = this.opts.stateInterval ?? 5000;
    this.stateTimer = setInterval(() => {
      void (async () => {
        const state = await pollSystemState();
        this.client.send(
          createMessage("state_update", {
            hostname,
            device_name: deviceName,
            platform,
            agent_version: AGENT_VERSION,
            active_window_app: state.activeWindowApp,
            active_window_title: state.activeWindowTitle,
            idle_time_ms: state.idleTimeMs,
            volume: state.volume,
            is_muted: state.isMuted,
            mic_volume: state.micVolume,
            mic_muted: state.micMuted,
            mac_addresses: macAddresses,
          }),
        );
      })().catch((err: unknown) => {
        log.error("State poll error", { err: String(err) });
      });
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
    const parsed = PluginManifestSchema.safeParse(msg.data);
    if (!parsed.success) {
      log.error("Invalid plugin_manifest payload", { error: parsed.error.message });
      return;
    }
    const { plugins } = parsed.data;
    log.debug(`Hub announced ${plugins.length} plugins`);

    const statuses: Array<{
      id: string;
      version: string;
      status: string;
      error?: string;
    }> = [];

    const deviceName = getDeviceName();

    for (const plugin of plugins) {
      try {
        // Skip if already loaded with the same version
        if (this.loader.getPlugin(plugin.id) && this.loader.hasCached(plugin.id, plugin.sha256)) {
          statuses.push({ id: plugin.id, version: plugin.version, status: "active" });
          continue;
        }

        // Unload existing version before loading new version
        if (this.loader.getPlugin(plugin.id)) {
          this.loadingPlugins.add(plugin.id);
          await this.loader.unloadPlugin(plugin.id);
        }

        if (this.loader.hasCached(plugin.id, plugin.sha256)) {
          // Load from cache
          await this.loader.loadFromCache(plugin.id, {
            hostname: deviceName,
            onStateUpdate: (pId, key, value) => {
              this.client.send(
                createMessage("plugin_state", { pluginId: pId, key, value }),
              );
            },
            onLog: (pluginId, level, msg, data) => {
              this.client.send(
                createMessage("plugin_log", { hostname: deviceName, pluginId, level, msg, data }),
              );
            },
            platformRequest: this.opts.platformRequest,
            onActiveUpdate: (pluginId, active, metadata) => {
              this.client.send(
                createMessage("plugin_active", { pluginId, active, metadata }),
              );
            },
          });
          this.loadingPlugins.delete(plugin.id);
          statuses.push({ id: plugin.id, version: plugin.version, status: "active" });
        } else {
          // Request download from hub (loadingPlugins cleared when download completes)
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
    const parsed = PluginDownloadResponseSchema.safeParse(msg.data);
    if (!parsed.success) {
      log.error("Invalid plugin_download_response payload", { error: parsed.error.message });
      return;
    }
    const { id, code, sha256 } = parsed.data;
    const deviceName = getDeviceName();
    try {
      // Unload existing version before loading new code
      if (this.loader.getPlugin(id)) {
        this.loadingPlugins.add(id);
        await this.loader.unloadPlugin(id);
      }

      await this.loader.loadFromCode(id, code, sha256, {
        hostname: deviceName,
        onStateUpdate: (pId, key, value) => {
          this.client.send(
            createMessage("plugin_state", { pluginId: pId, key, value }),
          );
        },
        onLog: (pluginId, level, msg, data) => {
          this.client.send(
            createMessage("plugin_log", { hostname: deviceName, pluginId, level, msg, data }),
          );
        },
        platformRequest: this.opts.platformRequest,
        onActiveUpdate: (pluginId, active, metadata) => {
          this.client.send(
            createMessage("plugin_active", { pluginId, active, metadata }),
          );
        },
      });
      this.loadingPlugins.delete(id);
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
    const parsed = CommandSchema.safeParse(msg.data);
    if (!parsed.success) {
      this.client.sendResponse(
        "command_response",
        { success: false, error: `Invalid command payload: ${parsed.error.message}` },
        msg.id,
      );
      return;
    }
    const { command, params } = parsed.data;

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

    // Reject commands targeting a plugin that is mid-reload
    if (this.loadingPlugins.has(pluginId)) {
      this.client.sendResponse(
        "command_response",
        { success: false, error: `Plugin ${pluginId} is reloading, try again shortly` },
        msg.id,
      );
      return;
    }

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
    const parsed = PluginConfigUpdateSchema.safeParse(msg.data);
    if (!parsed.success) {
      log.error("Invalid plugin_config_update payload", { error: parsed.error.message });
      return;
    }
    const { id, config } = parsed.data;
    const plugin = this.loader.getPlugin(id);
    if (plugin) {
      plugin.reloadConfig(config);
      log.info(`Config reloaded for plugin ${id}`);
    }
  }
}

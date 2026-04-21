import { AgentClient } from "./ws/client.js";
import {
  createMessage,
  type WsMessage,
  PluginManifestSchema,
  CommandSchema,
  PluginConfigUpdateSchema,
  PluginDownloadResponseSchema,
} from "./ws/protocol.js";
import { HubConnectionManager } from "./ws/hub-connection-manager.js";
import type { HubConnection } from "./ws/hub-connection.js";
import { PluginLoader } from "./plugins/loader.js";
import type { LoaderOptions } from "./plugins/loader.js";
import { StateCache } from "./state-cache.js";
import type { AgentCredentials } from "./credentials.js";
import { HubResolver } from "./mdns-resolver.js";
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
  hostname?: string;
  cacheDir?: string;
  stateInterval?: number;
  /**
   * List of paired hubs the agent should connect to. At least one entry is
   * required in normal operation. Mutually exclusive with pairingCode.
   */
  credentialsList?: AgentCredentials[];
  /** Pairing-mode only: hub URL to dial for first-time pairing. */
  hubUrl?: string;
  /** Pairing-mode only: CA cert to pin during pair (if known ahead of time). */
  caCert?: string;
  /** Pairing-mode only: one-time pairing code from hub web UI. */
  pairingCode?: string;
  /** Called when pairing succeeds */
  onPaired?: (response: PairResponseData) => void;
  /** Called when pairing fails */
  onPairFailed?: (error: string) => void;
  /** Called when token auth fails (revoked) */
  onAuthFailed?: () => void;
  /** Called when any hub connects. */
  onConnected?: (hubName: string, hubUrl: string) => void;
  /** Called when a hub disconnects. */
  onDisconnected?: (reason: string) => void;
  /** Called when a hub is reconnecting. */
  onReconnecting?: () => void;
  /** Platform request handler (managed mode IPC to Tauri host) */
  platformRequest?: (method: string, params: Record<string, unknown>) => Promise<unknown>;
}

export class Agent {
  private manager: HubConnectionManager;
  private resolver = new HubResolver();
  /** Only set during pairing flow — pairing has no agent_id yet, so it runs its
   *  own AgentClient outside the manager. */
  private pairClient: AgentClient | null = null;
  private loader: PluginLoader;
  private opts: AgentOptions;
  private stateTimer: ReturnType<typeof setInterval> | null = null;
  /** Plugins currently being unloaded+reloaded — commands for these are rejected. */
  private loadingPlugins = new Set<string>();
  /** Last value each plugin emitted per state key, replayed to hubs on (re)connect. */
  private stateCache = new StateCache();

  constructor(opts: AgentOptions) {
    this.opts = opts;
    const cacheDir = opts.cacheDir ?? getPluginsCacheDir();
    this.loader = new PluginLoader(cacheDir);
    this.manager = new HubConnectionManager({ resolver: this.resolver });

    // Register shared message handlers on the manager. Each connection picks
    // them up automatically (including connections added later at runtime).
    this.manager.onMessage("plugin_manifest", (msg, conn) => {
      log.debug("Received plugin_manifest", { plugins: (msg.data as { plugins: unknown[] }).plugins });
      return this.handlePluginManifest(msg, conn);
    });
    this.manager.onMessage("command", (msg, conn) => {
      log.debug("Received command", msg.data as Record<string, unknown>);
      return this.handleCommand(msg, conn);
    });
    this.manager.onMessage("plugin_config_update", (msg) => {
      log.debug("Received plugin_config_update", msg.data as Record<string, unknown>);
      return this.handleConfigUpdate(msg);
    });
    this.manager.onMessage("plugin_download_response", (msg, conn) => {
      log.debug("Received plugin_download_response", { id: (msg.data as { id: string }).id });
      return this.handleDownloadResponse(msg, conn);
    });
    if (opts.onAuthFailed) {
      this.manager.onMessage("auth_failed", () => opts.onAuthFailed!());
    }

    this.manager.onAnyConnect((conn) => {
      // Replay cached plugin state so the hub's store is repopulated without
      // every plugin having to implement its own re-push logic.
      this.replayStateCache();
      // Start the host-state poll on first connect across any hub.
      if (!this.stateTimer) this.startStatePolling();
      opts.onConnected?.(conn.credentials.hub_name, conn.credentials.hub_address);
    });
    this.manager.onAnyDisconnect((_conn, reason) => {
      if (reason === "revoked") {
        opts.onAuthFailed?.();
        return;
      }
      opts.onDisconnected?.(reason);
    });
    this.manager.onAnyReconnecting(() => opts.onReconnecting?.());
  }

  async start(): Promise<void> {
    // Pre-load bun:ffi so plugins can use omnideck.ffi.open() synchronously
    await ensureFfi().catch(() => {});

    if (this.opts.pairingCode) {
      await this.startPairMode();
      return;
    }

    await this.startNormalMode();
  }

  private async startPairMode(): Promise<void> {
    if (!this.opts.hubUrl) {
      throw new Error("pairingCode requires hubUrl");
    }
    const deviceName = getDeviceName();
    const hostname = this.opts.hostname ?? getAgentHostname();

    this.pairClient = new AgentClient({
      hubUrl: this.opts.hubUrl,
      hostname,
      deviceName,
      platform: detectPlatform(),
      agentVersion: AGENT_VERSION,
      caCert: this.opts.caCert,
      skipHelloOnConnect: true,
      onDisconnected: (reason) => this.opts.onDisconnected?.(reason),
      onReconnecting: () => this.opts.onReconnecting?.(),
    });

    this.pairClient.onMessage("pair_response", (msg) => {
      const data = msg.data as PairResponseData;
      if (data.success) {
        // Successful pair: send hello so the hub records us as connected, then
        // start state polling. Caller persists creds via onPaired.
        this.pairClient!.send(this.pairClient!.createHelloMessage());
        this.startStatePolling();
        this.opts.onPaired?.(data);
      } else {
        this.opts.onPairFailed?.(data.error ?? "Unknown pairing error");
      }
    });

    await this.pairClient.connect();
    this.pairClient.sendPairRequest(this.opts.pairingCode!);
  }

  private async startNormalMode(): Promise<void> {
    const credsList = this.opts.credentialsList ?? [];
    if (credsList.length === 0) {
      throw new Error("Agent started in normal mode with no credentials");
    }

    // Start mDNS browsing if any paired hub can be matched by fingerprint.
    const needsResolver = credsList.some((c) => !!c.cert_fingerprint_sha256);
    if (needsResolver) this.resolver.start();

    const deviceName = getDeviceName();
    const hostname = this.opts.hostname ?? getAgentHostname();
    const platform = detectPlatform();

    for (const entry of credsList) {
      try {
        await this.manager.addHub({
          credentials: entry,
          clientOptions: {
            hostname,
            deviceName,
            platform,
            agentVersion: AGENT_VERSION,
          },
        });
      } catch (err) {
        log.error("Failed to start hub connection", {
          agentId: entry.agent_id,
          hub: entry.hub_name,
          err: String(err),
        });
      }
    }
  }

  private startStatePolling(): void {
    if (this.stateTimer) return;
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
        this.sendAll(
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
    this.stateCache.clearAll();
    this.manager.closeAll();
    this.resolver.stop();
    this.pairClient?.close();
    this.pairClient = null;
  }

  /** Hub connections currently in the manager. */
  hubs(): HubConnection[] {
    return this.manager.all();
  }

  /**
   * Request unpairing from a specific paired hub. If agentId is omitted and
   * there is exactly one connection, that one is used. Resolves when the hub
   * acknowledges; rejects on timeout or if the connection is not open.
   */
  async requestUnpair(agentId?: string, timeoutMs = 3000): Promise<void> {
    const conn = this.resolveUnpairTarget(agentId);
    if (!conn) {
      throw new Error(agentId ? `No connection for agent_id=${agentId}` : "No hub connections to unpair");
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("unpair timeout"));
      }, timeoutMs);

      conn.client.onMessage("unpair_response", (msg) => {
        clearTimeout(timer);
        const data = msg.data as { success: boolean; error?: string };
        if (data.success) resolve();
        else reject(new Error(data.error ?? "unpair failed"));
      });

      try {
        conn.send(createMessage("unpair_request", {}));
      } catch (err) {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private resolveUnpairTarget(agentId?: string): HubConnection | undefined {
    if (agentId) return this.manager.get(agentId);
    const all = this.manager.all();
    return all.length === 1 ? all[0] : undefined;
  }

  /**
   * Send a message to every outbound channel currently active. In pair mode
   * this targets the pairing client; in normal mode it broadcasts to all
   * connected hubs.
   */
  private sendAll(msg: WsMessage): void {
    if (this.pairClient) {
      this.pairClient.send(msg);
      return;
    }
    this.manager.broadcast(msg);
  }

  /**
   * Options passed to every plugin load. Centralizes the agent→hub callbacks
   * so state, log, and active messages all flow through a single choke point.
   */
  private buildLoaderOptions(deviceName: string): LoaderOptions {
    return {
      hostname: deviceName,
      onStateUpdate: (pluginId, key, value) => {
        this.stateCache.set(pluginId, key, value);
        this.sendAll(
          createMessage("plugin_state", { pluginId, key, value }),
        );
      },
      onLog: (pluginId, level, msg, data) => {
        this.sendAll(
          createMessage("plugin_log", { hostname: deviceName, pluginId, level, msg, data }),
        );
      },
      platformRequest: this.opts.platformRequest,
      onActiveUpdate: (pluginId, active, metadata) => {
        this.sendAll(
          createMessage("plugin_active", { pluginId, active, metadata }),
        );
      },
    };
  }

  /** Replay every cached plugin state entry to all currently active channels. */
  private replayStateCache(): void {
    const size = this.stateCache.size();
    if (size === 0) return;
    log.info("Replaying cached plugin state to hub", { entries: size });
    for (const [pluginId, key, value] of this.stateCache.entries()) {
      this.sendAll(
        createMessage("plugin_state", { pluginId, key, value }),
      );
    }
  }

  private async handlePluginManifest(msg: WsMessage, conn: HubConnection): Promise<void> {
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
          this.stateCache.clearPlugin(plugin.id);
        }

        if (this.loader.hasCached(plugin.id, plugin.sha256)) {
          // Load from cache
          await this.loader.loadFromCache(plugin.id, this.buildLoaderOptions(deviceName));
          this.loadingPlugins.delete(plugin.id);
          statuses.push({ id: plugin.id, version: plugin.version, status: "active" });
        } else {
          // Request the bundle from the hub that announced it. The response
          // comes back on the same connection so handleDownloadResponse can
          // finish the load.
          conn.send(createMessage("plugin_download_request", { id: plugin.id }));
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

    conn.send(createMessage("plugin_status", { plugins: statuses }));
  }

  private async handleDownloadResponse(msg: WsMessage, conn: HubConnection): Promise<void> {
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
        this.stateCache.clearPlugin(id);
      }

      await this.loader.loadFromCode(id, code, sha256, this.buildLoaderOptions(deviceName));
      this.loadingPlugins.delete(id);
      conn.send(
        createMessage("plugin_status", {
          plugins: [{ id, version: "unknown", status: "active" }],
        }),
      );
      log.info(`Plugin ${id} downloaded and loaded`);
    } catch (err) {
      conn.send(
        createMessage("plugin_status", {
          plugins: [{ id, version: "unknown", status: "failed", error: String(err) }],
        }),
      );
    }
  }

  private async handleCommand(msg: WsMessage, conn: HubConnection): Promise<void> {
    const parsed = CommandSchema.safeParse(msg.data);
    if (!parsed.success) {
      conn.sendResponse(
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
      conn.sendResponse(
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
      conn.sendResponse(
        "command_response",
        { success: false, error: `Plugin ${pluginId} is reloading, try again shortly` },
        msg.id,
      );
      return;
    }

    const plugin = this.loader.getPlugin(pluginId);

    if (!plugin) {
      log.debug(`Plugin not loaded: ${pluginId}`, { loaded: this.loader.getLoadedPluginIds() });
      conn.sendResponse(
        "command_response",
        { success: false, error: `Plugin not loaded: ${pluginId}` },
        msg.id,
      );
      return;
    }

    const handler = plugin.actions.get(actionId);
    if (!handler) {
      log.debug(`Action not found: ${actionId}`, { available: Array.from(plugin.actions.keys()) });
      conn.sendResponse(
        "command_response",
        { success: false, error: `Action not found: ${actionId}` },
        msg.id,
      );
      return;
    }

    try {
      const result = await handler(params);
      log.debug(`Command ${command} completed`, result as unknown as Record<string, unknown>);
      conn.sendResponse("command_response", result, msg.id);
    } catch (err) {
      log.debug(`Command ${command} failed`, { error: String(err) });
      conn.sendResponse(
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

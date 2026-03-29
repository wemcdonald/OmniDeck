import { resolve, join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { parseDocument } from "yaml";
import sharp from "sharp";
import type { DeckManager } from "./deck/types.js";
import type { PageConfig, ButtonConfig } from "./config/validator.js";
import { PageConfigSchema } from "./config/validator.js";
import { ButtonRenderer } from "./renderer/renderer.js";
import type { ButtonState } from "./renderer/types.js";
import { StateStore } from "./state/store.js";
import { PluginHost } from "./plugins/host.js";
import { corePlugin } from "./plugins/builtin/core/index.js";
import { soundPlugin } from "./plugins/builtin/sound/index.js";
import { homeAssistantPlugin } from "./plugins/builtin/home-assistant/index.js";
import { osControlPlugin } from "./plugins/builtin/os-control/index.js";
import { monitorControlPlugin } from "./plugins/builtin/monitor-control/index.js";
import { createLogger, setLogBroadcaster } from "./logger.js";
import { WebServer } from "./web/server.js";
import { Broadcaster } from "./web/broadcast.js";
import { ConfigWatcher } from "./config/watcher.js";
import { AgentServer } from "./server/server.js";
import { PluginRegistry } from "./plugins/registry.js";
import { PairingManager } from "./server/pairing.js";
import { HubDiscovery } from "./server/discovery.js";
import { ModeEngine } from "./modes/engine.js";
import type { ModeDefinition, ModeCheck } from "./modes/types.js";
import type { ResolvedState } from "./modes/evaluator.js";
import { Orchestrator, type OrchestratorConfig } from "./orchestrator/orchestrator.js";
import type { FullConfig } from "./config/validator.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const log = createLogger("hub");

function parseDurationMs(s: string): number {
  const match = s.match(/^(\d+)(ms|s|m)$/);
  if (!match) return 30_000;
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case "ms": return value;
    case "s": return value * 1000;
    case "m": return value * 60_000;
    default: return 30_000;
  }
}

export interface TlsConfig {
  cert: Buffer;
  key: Buffer;
  caCert: Buffer;
  caFingerprint: string;
}

interface HubOptions {
  deck: DeckManager;
  configDir: string | undefined;
  pluginsDir?: string;
  webPort?: number;
  agentPort?: number;
  tls?: TlsConfig;
  hubName?: string;
  agentsRegistryPath?: string;
  authPasswordHash?: string;
  tlsRedirect?: boolean;
  httpsPort?: number;
}

export class Hub {
  private deck: DeckManager;
  private renderer: ButtonRenderer;
  private store: StateStore;
  private pluginHost: PluginHost;
  private pages = new Map<string, PageConfig>();
  private currentPageId = "";
  private previewRenderer: ButtonRenderer;
  private webServer: WebServer | null = null;
  private agentServer: AgentServer | null = null;
  private configWatcher: ConfigWatcher | null = null;
  private discovery: HubDiscovery | null = null;
  private broadcaster = new Broadcaster();
  private pairing: PairingManager | null = null;
  private modeEngine: ModeEngine | null = null;
  private orchestrator: Orchestrator | null = null;
  private opts: HubOptions;

  constructor(opts: HubOptions) {
    this.opts = opts;
    this.deck = opts.deck;
    this.renderer = new ButtonRenderer({ width: 96, height: 96 });
    this.previewRenderer = new ButtonRenderer({ width: 72, height: 72 });
    this.store = new StateStore();
    this.pluginHost = new PluginHost(this.store);
    this.pluginHost.register(corePlugin);
    this.pluginHost.register(soundPlugin);
    this.pluginHost.register(homeAssistantPlugin);
    this.pluginHost.register(osControlPlugin);
    this.pluginHost.register(monitorControlPlugin);
  }

  async start(
    pageConfigs: PageConfig[],
    pluginConfigs: Record<string, Record<string, unknown>> = {},
    modesConfig?: Record<string, {
      name: string;
      icon?: string;
      priority?: number;
      rules: Array<{
        condition: "and" | "or";
        checks: Array<Record<string, unknown>>;
      }>;
      on_enter?: Array<Record<string, unknown>>;
      on_exit?: Array<Record<string, unknown>>;
    }>,
    orchestratorConfig?: FullConfig["orchestrator"],
  ): Promise<void> {
    // Store pages
    for (const page of pageConfigs) {
      this.pages.set(page.page, page);
    }

    // Init plugins with their configuration
    await this.pluginHost.initAll(pluginConfigs);

    // Load external plugin registry
    let registry: PluginRegistry | undefined;
    if (this.opts.pluginsDir) {
      registry = new PluginRegistry(this.opts.pluginsDir);
      await registry.loadAll();
      log.info({ plugins: registry.getManifests().map((m) => m.id) }, "Plugin registry loaded");
    }

    // Initialize pairing manager
    if (this.opts.agentsRegistryPath) {
      this.pairing = new PairingManager(this.opts.agentsRegistryPath);
    }

    // Start agent WebSocket server
    const agentPort = this.opts.agentPort ?? 9210;
    this.agentServer = new AgentServer({
      port: agentPort,
      registry,
      tls: this.opts.tls ? { cert: this.opts.tls.cert, key: this.opts.tls.key } : undefined,
      pairing: this.pairing ?? undefined,
      caCert: this.opts.tls?.caCert.toString(),
      caFingerprint: this.opts.tls?.caFingerprint,
      hubName: this.opts.hubName,
    });
    const actualAgentPort = await this.agentServer.start();

    // mDNS discovery
    this.discovery = new HubDiscovery({
      port: actualAgentPort,
      name: this.opts.hubName,
      fingerprint: this.opts.tls?.caFingerprint,
    });
    this.discovery.advertise();

    // Initialize orchestrator (focus tracking, media routing)
    if (orchestratorConfig) {
      const focusCfg = orchestratorConfig.focus;
      const mediaCfg = orchestratorConfig.media;
      this.orchestrator = new Orchestrator(
        {
          focus: {
            strategy: focusCfg?.strategy ?? "idle_time",
            idle_threshold_ms: parseDurationMs(focusCfg?.idle_threshold ?? "30s"),
            switch_page_on_focus: focusCfg?.switch_page_on_focus ?? true,
          },
          media: {
            strategy: mediaCfg?.route_to ?? "active_player",
          },
          device_pages: orchestratorConfig.device_pages,
        },
        this.store,
      );
      log.info({ strategy: focusCfg?.strategy ?? "idle_time" }, "Orchestrator initialized");
    }

    // Bridge agent state into the state store so plugins can read it
    this.agentServer.onAgentStateUpdate((hostname, state) => {
      this.store.set("os-control", `agent:${hostname}:state`, state);
      this.store.set("os-control", `agent:${hostname}:online`, true);
      // Feed idle time to orchestrator for focus tracking
      this.orchestrator?.handleAgentState(hostname, {
        online: true,
        idleTimeMs: state.idle_time_ms ?? 0,
      });
      // Publish focused device to store
      const focused = this.orchestrator?.focusedDevice ?? null;
      this.store.set("orchestrator", "focused_device", focused);
    });
    this.agentServer.onAgentConnection((hostname, connected) => {
      this.store.set("os-control", `agent:${hostname}:online`, connected);
      if (connected) {
        this.orchestrator?.handleAgentConnect(hostname);
      } else {
        this.orchestrator?.handleAgentDisconnect(hostname);
        this.orchestrator?.handleAgentState(hostname, { online: false, idleTimeMs: 0 });
        const focused = this.orchestrator?.focusedDevice ?? null;
        this.store.set("orchestrator", "focused_device", focused);
      }
    });

    // Bridge agent plugin state into the hub state store
    this.agentServer.onPluginState((hostname, pluginId, key, value) => {
      this.store.set(pluginId, `agent:${hostname}:${key}`, value);
    });

    // Initialize mode engine (if modes configured)
    if (modesConfig && Object.keys(modesConfig).length > 0) {
      const modes: ModeDefinition[] = Object.entries(modesConfig).map(
        ([id, cfg]) => ({
          id,
          name: cfg.name,
          icon: cfg.icon,
          priority: cfg.priority ?? 50,
          rules: cfg.rules.map((r) => ({
            condition: r.condition,
            checks: r.checks.map((c): ModeCheck => ({
              provider: c.provider as string,
              attribute: c.attribute as string,
              params: c.params as Record<string, unknown> | undefined,
              target: c.target as string | undefined,
              equals: c.equals as ModeCheck["equals"],
              not_equals: c.not_equals as ModeCheck["not_equals"],
              in: c.in as ModeCheck["in"],
              not_in: c.not_in as ModeCheck["not_in"],
              greater_than: c.greater_than as number | undefined,
              less_than: c.less_than as number | undefined,
              contains: c.contains as string | undefined,
              matches: c.matches as string | undefined,
              not: c.not as boolean | undefined,
            })),
          })),
          onEnter: cfg.on_enter?.map((a) => ({
            switch_page: a.switch_page as string | undefined,
            trigger_action: a.trigger_action as string | undefined,
            params: a.params as Record<string, unknown> | undefined,
          })),
          onExit: cfg.on_exit?.map((a) => ({
            switch_page: a.switch_page as string | undefined,
            trigger_action: a.trigger_action as string | undefined,
            params: a.params as Record<string, unknown> | undefined,
          })),
        }),
      );

      this.modeEngine = new ModeEngine(modes, {
        store: this.store,
        resolveState: (qualifiedId, params): ResolvedState | undefined => {
          const result = this.pluginHost.resolveState(qualifiedId, params);
          if (!result) return undefined;
          return {
            state: result.state as unknown as Record<string, unknown>,
            variables: result.variables,
          };
        },
        executeAction: (qualifiedId, params) =>
          this.pluginHost.executeAction(qualifiedId, params, {
            focusedAgent: this.orchestrator?.focusedDevice ?? undefined,
          }),
      });

      this.modeEngine.onModeChange((from, to) => {
        log.info(
          { from: from?.id ?? null, to: to?.id ?? null },
          "Mode changed",
        );
        // Broadcast mode change to web clients
        this.broadcaster.send({
          type: "mode:change",
          data: {
            from: from ? { id: from.id, name: from.name, icon: from.icon } : null,
            to: to ? { id: to.id, name: to.name, icon: to.icon } : null,
          },
        });
      });
    }

    // Start web server
    setLogBroadcaster(this.broadcaster);
    const webDistDir = resolve(__dirname, "../../dist/web");
    this.webServer = new WebServer({
      port: this.opts.webPort ?? 0,
      configDir: this.opts.configDir,
      pluginsDir: this.opts.pluginsDir,
      agentServer: this.agentServer,
      pluginHost: this.pluginHost,
      broadcaster: this.broadcaster,
      staticDir: existsSync(webDistDir) ? webDistDir : undefined,
      getPagePreview: (pageId) => this.getPagePreview(pageId),
      getDeckPreview: () => this.getDeckPreview(),
      pressKey: (key) => this.pressKey(key),
      getPluginStatuses: () => this.pluginHost.getStatuses(),
      getPresets: () => this.pluginHost.getAllPresets(),
      store: this.store,
      debugModes: this.modeEngine ? () => this.modeEngine!.debugEvaluate() : undefined,
      getModeHistory: this.modeEngine ? () => [...this.modeEngine!.history] : undefined,
      getModeOverride: () => (this.store.get("omnideck-core", "mode_override") as string | null) ?? null,
      pairing: this.pairing ?? undefined,
      tls: this.opts.tls ? { cert: this.opts.tls.cert, key: this.opts.tls.key } : undefined,
      httpsPort: this.opts.httpsPort,
      authPasswordHash: this.opts.authPasswordHash,
      tlsRedirect: this.opts.tlsRedirect,
      caCertPath: this.opts.tls?.caCert ? undefined : undefined,
      caCert: this.opts.tls?.caCert,
    });
    await this.webServer.start();

    // Watch config directory for page changes
    if (this.opts.configDir) {
      this.configWatcher = new ConfigWatcher(this.opts.configDir);
      this.configWatcher.onChange((filePath) => {
        const pagesDir = join(this.opts.configDir!, "pages");
        if (!filePath.startsWith(pagesDir)) return;
        const ext = extname(filePath);
        if (ext !== ".yaml" && ext !== ".yml") return;
        const pageId = basename(filePath, ext);
        if (existsSync(filePath)) {
          try {
            const raw = parseDocument(readFileSync(filePath, "utf-8"), {
              customTags: [{ tag: "!secret", identify: () => false, resolve: (str: string) => str }],
            }).toJSON();
            const page = PageConfigSchema.parse(raw);
            this.pages.set(pageId, page);
          } catch (err) {
            log.warn({ err, filePath }, "Failed to reload page config");
            return;
          }
        } else {
          this.pages.delete(pageId);
        }
        if (pageId === this.currentPageId) {
          this.renderCurrentPage().catch((err) =>
            log.error({ err }, "Re-render after config change failed"),
          );
        }
      });
      await this.configWatcher.start();
    }

    // Connect deck
    await this.deck.connect();
    this.renderer = new ButtonRenderer(this.deck.keySize);

    // Set initial page
    const firstPage = pageConfigs[0]?.page ?? "home";
    this.store.set("omnideck-core", "current_page", firstPage);
    this.currentPageId = firstPage;

    // Debounced incremental render: coalesce rapid state changes
    let renderTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRender = () => {
      if (renderTimer) return;
      renderTimer = setTimeout(() => {
        renderTimer = null;
        this.renderDirtyButtons().catch((err) =>
          log.error({ err }, "State-driven re-render error"),
        );
      }, 100);
    };

    // Listen for state changes
    this.store.onChange((pluginId, stateKey, value) => {
      if (pluginId === "omnideck-core" && stateKey === "current_page") {
        this.currentPageId = value as string;
        this.renderCurrentPage().catch((err) =>
          log.error({ err }, "Page render error"),
        );
        return;
      }

      // Dispatch pending:<target>:<action> state changes as commands to agents
      if (stateKey.startsWith("pending:")) {
        const parts = stateKey.split(":");
        if (parts.length >= 3) {
          const target = parts[1];
          const action = parts.slice(2).join(":");
          const payload = value as { params?: Record<string, unknown> } | undefined;
          log.info({ pluginId, target, action, params: payload?.params }, `Dispatching ${pluginId}.${action} → ${target}`);
          this.agentServer?.sendCommand(target, `${pluginId}.${action}`, payload?.params ?? {}).then((result) =>
            log.info({ target, action, result }, `Agent response: ${pluginId}.${action}`),
          ).catch((err) =>
            log.error({ err, target, action }, "Failed to dispatch command to agent"),
          );
        }
        return;
      }

      // Entity/plugin state changed — debounced re-render of current page
      if (
        stateKey.startsWith("entity:") ||
        stateKey.startsWith("agent:") ||
        stateKey === "active_mode"
      ) {
        scheduleRender();
      }
    });

    // Render initial page
    await this.renderCurrentPage();

    // Start mode engine (after plugins are initialized and initial page is rendered)
    if (this.modeEngine) {
      this.modeEngine.start();
    }

    // Listen for key presses (short press vs long press >500ms)
    const keyDownTimes = new Map<number, number>();

    this.deck.onKeyDown((key) => {
      keyDownTimes.set(key, Date.now());
    });

    this.deck.onKeyUp((key) => {
      const downTime = keyDownTimes.get(key);
      keyDownTimes.delete(key);
      if (downTime === undefined) return;
      const isLongPress = Date.now() - downTime >= 500;
      this.handleKeyPress(key, isLongPress).catch((err) =>
        log.error({ err, key }, "Key press handler error"),
      );
    });
  }

  async stop(): Promise<void> {
    if (this.modeEngine) {
      this.modeEngine.stop();
      this.modeEngine = null;
    }
    if (this.discovery) {
      this.discovery.destroy();
      this.discovery = null;
    }
    if (this.configWatcher) {
      await this.configWatcher.stop();
      this.configWatcher = null;
    }
    if (this.agentServer) {
      await this.agentServer.stop();
      this.agentServer = null;
    }
    if (this.webServer) {
      await this.webServer.stop();
      this.webServer = null;
    }
  }

  getCurrentPage(): string {
    return this.currentPageId;
  }

  async getPagePreview(pageId: string): Promise<Record<string, string>> {
    const page = this.pages.get(pageId);
    if (!page) return {};

    const width = 72;
    const height = 72;
    const result: Record<string, string> = {};

    for (const button of page.buttons) {
      const [col, row] = button.pos;
      const state = this.resolveButtonState(button);
      const rawBuf = await this.previewRenderer.render(state);
      const pngBuf = await sharp(rawBuf, { raw: { width, height, channels: 3 } })
        .png()
        .toBuffer();
      result[`${col},${row}`] = `data:image/png;base64,${pngBuf.toString("base64")}`;
    }

    return result;
  }

  async getDeckPreview(): Promise<Record<number, string>> {
    const page = this.pages.get(this.currentPageId);
    if (!page) return {};

    const { width, height } = this.deck.keySize;
    const columns = page.columns ?? this.deck.keyColumns;
    const result: Record<number, string> = {};

    const blackRaw = await this.renderer.render({});
    const blackJpeg = await sharp(blackRaw, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
    const blackB64 = blackJpeg.toString("base64");
    for (let i = 0; i < this.deck.keyCount; i++) {
      result[i] = blackB64;
    }

    for (const button of page.buttons) {
      const [col, row] = button.pos;
      const keyIndex = row * columns + col;
      if (keyIndex >= this.deck.keyCount) continue;
      const state = this.resolveButtonState(button);
      const raw = await this.renderer.render(state);
      const jpeg = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
      result[keyIndex] = jpeg.toString("base64");
    }

    return result;
  }

  async pressKey(keyIndex: number): Promise<void> {
    await this.handleKeyPress(keyIndex);
  }

  private async handleKeyPress(keyIndex: number, isLongPress = false): Promise<void> {
    const page = this.pages.get(this.currentPageId);
    if (!page) {
      log.warn({ keyIndex, pageId: this.currentPageId }, "Key press on unknown page");
      return;
    }

    const button = this.findButtonByKeyIndex(page, keyIndex);
    if (!button) {
      log.info({ keyIndex, pageId: this.currentPageId }, "Key press with no button");
      return;
    }

    const effectiveButton = this.applyModeOverrides(button);
    const resolved = this.resolveButton(effectiveButton);

    // Choose between long press action and normal action
    let action = resolved.action;
    let actionParams = resolved.actionParams;

    if (isLongPress && resolved.longPressAction) {
      action = resolved.longPressAction;
      actionParams = { ...resolved.actionParams, ...resolved.longPressParams };
    }

    if (!action) {
      log.info({ keyIndex, pageId: this.currentPageId }, "Key press with no action");
      return;
    }

    // Inject button-level target into action params (only if not already set explicitly)
    if (resolved.target && !(actionParams as Record<string, unknown>).target) {
      actionParams = { ...actionParams, target: resolved.target };
    }

    log.info({ pos: button.pos, action, params: actionParams, target: resolved.target, isLongPress }, `[${button.pos}] ${isLongPress ? "long " : ""}pressed → ${action}`);
    await this.pluginHost.executeAction(action, actionParams, {
      targetAgent: resolved.target,
      focusedAgent: this.orchestrator?.focusedDevice ?? undefined,
    });
  }

  private findButtonByKeyIndex(
    page: PageConfig,
    keyIndex: number,
  ): ButtonConfig | undefined {
    const columns = page.columns ?? this.deck.keyColumns;
    for (const button of page.buttons) {
      const [col, row] = button.pos;
      const idx = row * columns + col;
      if (idx === keyIndex) return button;
    }
    return undefined;
  }

  /** Hash a ButtonState into a string for dirty-checking. */
  private hashState(state: ButtonState): string {
    // Fast JSON key — covers all visual properties
    return JSON.stringify(state);
  }

  /** Cache of last-rendered state hash per key index. */
  private stateCache = new Map<number, string>();

  /**
   * Full page render — clears all keys and renders from scratch.
   * Used on page switch or config reload.
   */
  private async renderCurrentPage(): Promise<void> {
    const page = this.pages.get(this.currentPageId);
    if (!page) return;

    this.stateCache.clear();

    // Clear all keys first (black)
    const blackImage = await this.renderer.render({});
    for (let i = 0; i < this.deck.keyCount; i++) {
      await this.deck.setKeyImage(i, blackImage);
    }

    // Render each button
    const columns = page.columns ?? this.deck.keyColumns;
    for (const button of page.buttons) {
      const [col, row] = button.pos;
      const keyIndex = row * columns + col;
      if (keyIndex >= this.deck.keyCount) continue;

      const state = this.resolveButtonState(button);
      const image = await this.renderer.render(state);
      await this.deck.setKeyImage(keyIndex, image);
      this.stateCache.set(keyIndex, this.hashState(state));
    }

    // Broadcast full preview to web clients
    this.getDeckPreview()
      .then((images) => this.broadcaster.send({ type: "deck:update", data: { page: this.currentPageId, images } }))
      .catch((err) => log.warn({ err }, "Failed to broadcast deck preview"));
  }

  /**
   * Incremental render — only re-renders buttons whose resolved state changed.
   * Used on entity/agent state updates.
   */
  private async renderDirtyButtons(): Promise<void> {
    const page = this.pages.get(this.currentPageId);
    if (!page) return;

    const columns = page.columns ?? this.deck.keyColumns;
    let anyChanged = false;

    for (const button of page.buttons) {
      const [col, row] = button.pos;
      const keyIndex = row * columns + col;
      if (keyIndex >= this.deck.keyCount) continue;

      const state = this.resolveButtonState(button);
      const hash = this.hashState(state);

      if (this.stateCache.get(keyIndex) === hash) continue;

      // State changed — re-render this button
      this.stateCache.set(keyIndex, hash);
      const image = await this.renderer.render(state);
      await this.deck.setKeyImage(keyIndex, image);
      anyChanged = true;
    }

    // Only broadcast to web if something actually changed
    if (anyChanged) {
      this.getDeckPreview()
        .then((images) => this.broadcaster.send({ type: "deck:update", data: { page: this.currentPageId, images } }))
        .catch((err) => log.warn({ err }, "Failed to broadcast deck preview"));
    }
  }

  /**
   * Interpolate Mustache-style {{var}} templates in a string.
   */
  private interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => vars[key] ?? _match);
  }

  /**
   * Resolve a button's preset (if any) into its effective action, params,
   * state provider, and visual defaults. Explicit button-level values
   * always override preset defaults.
   */
  private resolveButton(button: ButtonConfig): {
    action: string | undefined;
    actionParams: Record<string, unknown>;
    longPressAction: string | undefined;
    longPressParams: Record<string, unknown>;
    stateProvider: string | undefined;
    stateParams: Record<string, unknown>;
    target: string | undefined;
    icon: string | undefined;
    label: string | undefined;
    topLabel: string | undefined;
    background: string | undefined;
  } {
    // Start with explicit button-level values
    let action = button.action;
    const userParams: Record<string, unknown> = button.params ?? {};
    let longPressAction = button.long_press_action;
    let longPressParams: Record<string, unknown> = button.long_press_params ?? {};
    let stateProvider = button.state?.provider;
    let stateParams: Record<string, unknown> = button.state?.params ?? {};
    let icon = button.icon;
    let label = button.label;
    let topLabel = button.top_label;
    let background = button.background;

    // If button uses a preset, resolve defaults
    if (button.preset) {
      const [pluginId, presetId] = button.preset.includes(".")
        ? button.preset.split(".", 2) as [string, string]
        : ["", button.preset];
      const preset = this.pluginHost.getPreset(pluginId, presetId);

      if (preset) {
        // Preset action/stateProvider — only fill in what the button doesn't set
        if (!action && preset.action) {
          action = `${pluginId}.${preset.action}`;
        }
        if (!longPressAction && preset.longPressAction) {
          longPressAction = `${pluginId}.${preset.longPressAction}`;
        }
        if (!stateProvider && preset.stateProvider) {
          stateProvider = `${pluginId}.${preset.stateProvider}`;
        }

        // Preset appearance defaults
        if (!icon && preset.defaults.icon) icon = preset.defaults.icon;
        if (!label && preset.defaults.label) label = preset.defaults.label;
        if (!topLabel && preset.defaults.topLabel) topLabel = preset.defaults.topLabel;
        if (!background && preset.defaults.background) background = preset.defaults.background;

        // Long press defaults from preset
        if (preset.longPressDefaults && Object.keys(longPressParams).length === 0) {
          longPressParams = preset.longPressDefaults;
        }

        // Forward all user params to both action and state provider
        if (!button.state?.params) {
          stateParams = userParams;
        }
      } else {
        log.warn({ preset: button.preset }, "Preset not found");
      }
    }

    return { action, actionParams: userParams, longPressAction, longPressParams, stateProvider, stateParams, target: button.target, icon, label, topLabel, background };
  }

  /**
   * Apply mode overrides to a button config. Returns a shallow copy with
   * the active mode's overrides merged in, or the original if no overrides apply.
   */
  private applyModeOverrides(button: ButtonConfig): ButtonConfig {
    if (!button.modes) return button;

    const activeMode = this.store.get("omnideck-core", "active_mode") as string | null;
    if (!activeMode) return button;

    const override = button.modes[activeMode];
    if (!override) return button;

    // Merge helper: null means "clear", undefined means "inherit base"
    const merge = <T>(overrideVal: T | null | undefined, baseVal: T | undefined): T | undefined => {
      if (overrideVal === null) return undefined; // explicit clear
      if (overrideVal !== undefined) return overrideVal; // override set
      return baseVal; // inherit
    };

    // If action is overridden but params aren't, default to empty params
    // to avoid passing the base action's params to a different action.
    const actionOverridden = override.action !== undefined && override.action !== null;
    const longPressOverridden = override.long_press_action !== undefined && override.long_press_action !== null;

    return {
      ...button,
      action: merge(override.action, button.action),
      params: override.params !== undefined
        ? (override.params === null ? undefined : override.params)
        : (actionOverridden ? {} : button.params),
      state: merge(override.state, button.state),
      icon: merge(override.icon, button.icon),
      icon_color: merge(override.icon_color, button.icon_color),
      label: merge(override.label, button.label),
      label_color: merge(override.label_color, button.label_color),
      top_label: merge(override.top_label, button.top_label),
      top_label_color: merge(override.top_label_color, button.top_label_color),
      background: merge(override.background, button.background),
      opacity: merge(override.opacity, button.opacity),
      long_press_action: merge(override.long_press_action, button.long_press_action),
      long_press_params: override.long_press_params !== undefined
        ? (override.long_press_params === null ? undefined : override.long_press_params)
        : (longPressOverridden ? {} : button.long_press_params),
    };
  }

  private resolveButtonState(button: ButtonConfig): ButtonState {
    // Apply mode overrides before resolving
    const effectiveButton = this.applyModeOverrides(button);
    const resolved = this.resolveButton(effectiveButton);

    const state: ButtonState = {
      background: resolved.background ?? effectiveButton.background,
      icon: resolved.icon ?? effectiveButton.icon,
      iconColor: effectiveButton.icon_color,
      label: resolved.label ?? effectiveButton.label,
      labelColor: effectiveButton.label_color,
      topLabel: effectiveButton.top_label !== undefined ? effectiveButton.top_label : resolved.topLabel,
      topLabelColor: effectiveButton.top_label_color,
      opacity: effectiveButton.opacity,
    };

    // Template variables from the state provider (for Mustache interpolation)
    let templateVars: Record<string, string> = {};

    if (resolved.stateProvider) {
      // Inject button-level target into state params (only if not already set explicitly)
      const stateParams = resolved.target && !(resolved.stateParams as Record<string, unknown>).target
        ? { ...resolved.stateParams, target: resolved.target }
        : resolved.stateParams;

      const providerResult = this.pluginHost.resolveState(
        resolved.stateProvider,
        stateParams,
      );
      if (providerResult) {
        // New format: { state, variables }
        if ("state" in providerResult && "variables" in providerResult) {
          Object.assign(state, providerResult.state);
          templateVars = providerResult.variables;
        } else {
          // Legacy fallback: provider returns ButtonStateResult directly
          Object.assign(state, providerResult);
        }
      }
    }

    // Explicit button-level values always win over state provider results.
    // Also interpolate Mustache templates in user-set labels.
    if (effectiveButton.icon) state.icon = effectiveButton.icon;
    if (effectiveButton.background) state.background = effectiveButton.background;
    if (effectiveButton.label) {
      state.label = this.interpolate(effectiveButton.label, templateVars);
    } else if (state.label && state.label.includes("{{")) {
      // Preset-provided label template — also interpolate
      state.label = this.interpolate(state.label, templateVars);
    }
    if (effectiveButton.top_label === null) {
      state.topLabel = undefined;
    } else if (effectiveButton.top_label) {
      state.topLabel = this.interpolate(effectiveButton.top_label, templateVars);
    } else if (state.topLabel && state.topLabel.includes("{{")) {
      state.topLabel = this.interpolate(state.topLabel, templateVars);
    }

    return state;
  }
}

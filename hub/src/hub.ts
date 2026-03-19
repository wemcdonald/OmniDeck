import { resolve, join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
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
import { createLogger, setLogBroadcaster } from "./logger.js";
import { WebServer } from "./web/server.js";
import { Broadcaster } from "./web/broadcast.js";
import { ConfigWatcher } from "./config/watcher.js";
import { AgentServer } from "./server/server.js";
import { PluginRegistry } from "./plugins/registry.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const log = createLogger("hub");

interface HubOptions {
  deck: DeckManager;
  configDir: string | undefined;
  pluginsDir?: string;
  webPort?: number;
  agentPort?: number;
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
  private broadcaster = new Broadcaster();
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
  }

  async start(
    pageConfigs: PageConfig[],
    pluginConfigs: Record<string, Record<string, unknown>> = {},
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

    // Start agent WebSocket server
    const agentPort = this.opts.agentPort ?? 9210;
    this.agentServer = new AgentServer({ port: agentPort, registry });
    await this.agentServer.start();

    // Bridge agent state into the state store so plugins can read it
    this.agentServer.onAgentStateUpdate((hostname, state) => {
      this.store.set("os-control", `agent:${hostname}:state`, state);
      this.store.set("os-control", `agent:${hostname}:online`, true);
    });
    this.agentServer.onAgentConnection((hostname, connected) => {
      this.store.set("os-control", `agent:${hostname}:online`, connected);
    });

    // Start web server
    setLogBroadcaster(this.broadcaster);
    const webDistDir = resolve(__dirname, "../../dist/web");
    this.webServer = new WebServer({
      port: this.opts.webPort ?? 0,
      configDir: this.opts.configDir,
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
            const raw = parseYaml(readFileSync(filePath, "utf-8"));
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
          this.agentServer?.sendCommand(target, `${pluginId}.${action}`, payload?.params ?? {}).catch((err) =>
            log.error({ err, target, action }, "Failed to dispatch command to agent"),
          );
        }
        return;
      }

      // Entity/plugin state changed — debounced re-render of current page
      if (stateKey.startsWith("entity:") || stateKey.startsWith("agent:")) {
        scheduleRender();
      }
    });

    // Render initial page
    await this.renderCurrentPage();

    // Listen for key presses
    this.deck.onKeyDown((key) => {
      this.handleKeyPress(key).catch((err) =>
        log.error({ err, key }, "Key press handler error"),
      );
    });
  }

  async stop(): Promise<void> {
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

  private async handleKeyPress(keyIndex: number): Promise<void> {
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

    const resolved = this.resolveButton(button);
    if (!resolved.action) {
      log.info({ keyIndex, pageId: this.currentPageId }, "Key press with no action");
      return;
    }

    log.info({ pos: button.pos, action: resolved.action, params: resolved.actionParams }, `[${button.pos}] pressed → ${resolved.action}`);
    await this.pluginHost.executeAction(resolved.action, resolved.actionParams);
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
    stateProvider: string | undefined;
    stateParams: Record<string, unknown>;
    icon: string | undefined;
    label: string | undefined;
    topLabel: string | undefined;
    background: string | undefined;
  } {
    // Start with explicit button-level values
    let action = button.action;
    const userParams: Record<string, unknown> = button.params ?? {};
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
        if (!stateProvider && preset.stateProvider) {
          stateProvider = `${pluginId}.${preset.stateProvider}`;
        }

        // Preset appearance defaults
        if (!icon && preset.defaults.icon) icon = preset.defaults.icon;
        if (!label && preset.defaults.label) label = preset.defaults.label;
        if (!topLabel && preset.defaults.topLabel) topLabel = preset.defaults.topLabel;
        if (!background && preset.defaults.background) background = preset.defaults.background;

        // Forward all user params to both action and state provider
        if (!button.state?.params) {
          stateParams = userParams;
        }
      } else {
        log.warn({ preset: button.preset }, "Preset not found");
      }
    }

    return { action, actionParams: userParams, stateProvider, stateParams, icon, label, topLabel, background };
  }

  private resolveButtonState(button: ButtonConfig): ButtonState {
    const resolved = this.resolveButton(button);

    const state: ButtonState = {
      background: resolved.background ?? button.background,
      icon: resolved.icon ?? button.icon,
      iconColor: button.icon_color,
      label: resolved.label ?? button.label,
      labelColor: button.label_color,
      topLabel: resolved.topLabel ?? button.top_label,
      topLabelColor: button.top_label_color,
      opacity: button.opacity,
    };

    // Template variables from the state provider (for Mustache interpolation)
    let templateVars: Record<string, string> = {};

    if (resolved.stateProvider) {
      const providerResult = this.pluginHost.resolveState(
        resolved.stateProvider,
        resolved.stateParams,
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
    if (button.icon) state.icon = button.icon;
    if (button.background) state.background = button.background;
    if (button.label) {
      state.label = this.interpolate(button.label, templateVars);
    } else if (state.label && state.label.includes("{{")) {
      // Preset-provided label template — also interpolate
      state.label = this.interpolate(state.label, templateVars);
    }
    if (button.top_label) {
      state.topLabel = this.interpolate(button.top_label, templateVars);
    } else if (state.topLabel && state.topLabel.includes("{{")) {
      state.topLabel = this.interpolate(state.topLabel, templateVars);
    }

    return state;
  }
}

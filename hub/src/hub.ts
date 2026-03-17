import type { DeckManager } from "./deck/types.js";
import type { PageConfig, ButtonConfig } from "./config/validator.js";
import { ButtonRenderer } from "./renderer/renderer.js";
import type { ButtonState } from "./renderer/types.js";
import { StateStore } from "./state/store.js";
import { PluginHost } from "./plugins/host.js";
import { corePlugin } from "./plugins/builtin/core/index.js";
import { createLogger, setLogBroadcaster } from "./logger.js";
import { WebServer } from "./web/server.js";
import { Broadcaster } from "./web/broadcast.js";

const log = createLogger("hub");

interface HubOptions {
  deck: DeckManager;
  configDir: string | undefined;
  webPort?: number;
}

export class Hub {
  private deck: DeckManager;
  private renderer: ButtonRenderer;
  private store: StateStore;
  private pluginHost: PluginHost;
  private pages = new Map<string, PageConfig>();
  private currentPageId = "";
  private webServer: WebServer | null = null;
  private broadcaster = new Broadcaster();
  private opts: HubOptions;

  constructor(opts: HubOptions) {
    this.opts = opts;
    this.deck = opts.deck;
    this.renderer = new ButtonRenderer({ width: 96, height: 96 });
    this.store = new StateStore();
    this.pluginHost = new PluginHost(this.store);
    this.pluginHost.register(corePlugin);
  }

  async start(pageConfigs: PageConfig[]): Promise<void> {
    // Store pages
    for (const page of pageConfigs) {
      this.pages.set(page.page, page);
    }

    // Init plugins
    await this.pluginHost.initAll({});

    // Start web server
    setLogBroadcaster(this.broadcaster);
    this.webServer = new WebServer({
      port: this.opts.webPort ?? 0,
      configDir: this.opts.configDir,
      broadcaster: this.broadcaster,
    });
    await this.webServer.start();

    // Connect deck
    await this.deck.connect();
    this.renderer = new ButtonRenderer(this.deck.keySize);

    // Set initial page
    const firstPage = pageConfigs[0]?.page ?? "home";
    this.store.set("omnideck-core", "current_page", firstPage);
    this.currentPageId = firstPage;

    // Listen for page changes (register BEFORE initial render so state-driven
    // page switches during render are not missed)
    this.store.onChange((pluginId, stateKey, value) => {
      if (pluginId === "omnideck-core" && stateKey === "current_page") {
        this.currentPageId = value as string;
        this.renderCurrentPage().catch((err) =>
          log.error({ err }, "Page render error"),
        );
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
    if (this.webServer) {
      await this.webServer.stop();
      this.webServer = null;
    }
  }

  getCurrentPage(): string {
    return this.currentPageId;
  }

  private async handleKeyPress(keyIndex: number): Promise<void> {
    const page = this.pages.get(this.currentPageId);
    if (!page) return;

    const button = this.findButtonByKeyIndex(page, keyIndex);
    if (!button?.action) return;

    await this.pluginHost.executeAction(button.action, button.params ?? {});
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

  private async renderCurrentPage(): Promise<void> {
    const page = this.pages.get(this.currentPageId);
    if (!page) return;

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
    }
  }

  private resolveButtonState(button: ButtonConfig): ButtonState {
    const state: ButtonState = {
      background: button.background,
      label: button.label,
      topLabel: button.top_label,
      opacity: button.opacity,
    };

    if (button.state?.provider) {
      const resolved = this.pluginHost.resolveState(
        button.state.provider,
        button.state.params ?? {},
      );
      if (resolved) {
        Object.assign(state, resolved);
      }
    }

    return state;
  }
}

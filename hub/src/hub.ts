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
import { createLogger, setLogBroadcaster } from "./logger.js";
import { WebServer } from "./web/server.js";
import { Broadcaster } from "./web/broadcast.js";
import { ConfigWatcher } from "./config/watcher.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

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
  private previewRenderer: ButtonRenderer;
  private webServer: WebServer | null = null;
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
    const webDistDir = resolve(__dirname, "../../dist/web");
    this.webServer = new WebServer({
      port: this.opts.webPort ?? 0,
      configDir: this.opts.configDir,
      broadcaster: this.broadcaster,
      staticDir: existsSync(webDistDir) ? webDistDir : undefined,
      getPagePreview: (pageId) => this.getPagePreview(pageId),
      getDeckPreview: () => this.getDeckPreview(),
      pressKey: (key) => this.pressKey(key),
      getPluginStatuses: () => this.pluginHost.getStatuses(),
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
    if (this.configWatcher) {
      await this.configWatcher.stop();
      this.configWatcher = null;
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

    // Broadcast updated preview to web clients
    this.getDeckPreview()
      .then((images) => this.broadcaster.send({ type: "deck:update", data: { page: this.currentPageId, images } }))
      .catch((err) => log.warn({ err }, "Failed to broadcast deck preview"));
  }

  private resolveButtonState(button: ButtonConfig): ButtonState {
    const state: ButtonState = {
      background: button.background,
      icon: button.icon,
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

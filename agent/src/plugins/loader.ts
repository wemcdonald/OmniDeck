import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createPluginRuntime, type PluginRuntime } from "./runtime.js";
import { createLogger } from "../logger.js";

const log = createLogger("loader");

interface LoaderOptions {
  config?: Record<string, unknown>;
  hostname?: string;
  onStateUpdate?: (pluginId: string, key: string, value: unknown) => void;
}

export class PluginLoader {
  private cacheDir: string;
  private plugins = new Map<string, PluginRuntime>();

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  }

  hasCached(pluginId: string, sha256: string): boolean {
    const metaPath = join(this.cacheDir, pluginId, "meta.json");
    if (!existsSync(metaPath)) return false;
    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as { sha256: string };
    return meta.sha256 === sha256;
  }

  async loadFromCode(
    pluginId: string,
    code: string,
    sha256: string,
    opts: LoaderOptions = {},
  ): Promise<PluginRuntime> {
    // Write to cache
    const pluginDir = join(this.cacheDir, pluginId);
    if (!existsSync(pluginDir)) mkdirSync(pluginDir, { recursive: true });
    const codePath = join(pluginDir, "agent.mjs");
    writeFileSync(codePath, code);
    writeFileSync(
      join(pluginDir, "meta.json"),
      JSON.stringify({ sha256, loadedAt: new Date().toISOString() }),
    );

    // Build runtime
    const { omnideck, runtime } = createPluginRuntime({
      pluginId,
      config: opts.config ?? {},
      hostname: opts.hostname ?? "unknown",
      onStateUpdate: opts.onStateUpdate ?? (() => {}),
    });

    // Dynamic import the plugin module
    try {
      const mod = await import(codePath);
      const init = mod.default;
      if (typeof init !== "function") {
        throw new Error(`Plugin ${pluginId} does not default-export an init function`);
      }
      await init(omnideck);
      this.plugins.set(pluginId, runtime);
      log.info(`Plugin ${pluginId} loaded successfully`);
    } catch (err) {
      log.error(`Plugin ${pluginId} failed to init`, { err: String(err) });
      throw err;
    }

    return runtime;
  }

  async loadFromCache(pluginId: string, opts: LoaderOptions = {}): Promise<PluginRuntime> {
    const codePath = join(this.cacheDir, pluginId, "agent.mjs");
    const code = readFileSync(codePath, "utf-8");
    const meta = JSON.parse(
      readFileSync(join(this.cacheDir, pluginId, "meta.json"), "utf-8"),
    ) as { sha256: string };
    return this.loadFromCode(pluginId, code, meta.sha256, opts);
  }

  getPlugin(pluginId: string): PluginRuntime | undefined {
    return this.plugins.get(pluginId);
  }

  getLoadedPluginIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      await plugin.destroy();
      this.plugins.delete(pluginId);
    }
  }

  async unloadAll(): Promise<void> {
    for (const [, plugin] of this.plugins) {
      await plugin.destroy();
    }
    this.plugins.clear();
  }
}

import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createPluginRuntime, type PluginRuntime } from "./runtime.js";
import { createLogger } from "../logger.js";

const log = createLogger("loader");

interface CacheMeta {
  sha256: string;
  file: string;
  loadedAt: string;
}

interface LoaderOptions {
  config?: Record<string, unknown>;
  hostname?: string;
  onStateUpdate?: (pluginId: string, key: string, value: unknown) => void;
  onLog?: (pluginId: string, level: string, msg: string, data?: Record<string, unknown>) => void;
  platformRequest?: (method: string, params: Record<string, unknown>) => Promise<unknown>;
}

export class PluginLoader {
  private cacheDir: string;
  private plugins = new Map<string, PluginRuntime>();

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  }

  hasCached(pluginId: string, sha256: string): boolean {
    const meta = this.readMeta(pluginId);
    if (!meta) return false;
    // Also verify the code file still exists
    const codePath = join(this.cacheDir, pluginId, meta.file);
    return meta.sha256 === sha256 && existsSync(codePath);
  }

  async loadFromCode(
    pluginId: string,
    code: string,
    sha256: string,
    opts: LoaderOptions = {},
  ): Promise<PluginRuntime> {
    const pluginDir = join(this.cacheDir, pluginId);
    if (!existsSync(pluginDir)) mkdirSync(pluginDir, { recursive: true });

    // Read old meta to clean up previous version's file after successful load
    const oldMeta = this.readMeta(pluginId);

    // Write code to a unique filename so Bun's import() cache doesn't serve stale code
    const codeFile = `agent-${sha256.slice(0, 12)}.mjs`;
    const codePath = join(pluginDir, codeFile);
    writeFileSync(codePath, code);
    writeFileSync(
      join(pluginDir, "meta.json"),
      JSON.stringify({ sha256, file: codeFile, loadedAt: new Date().toISOString() }),
    );

    // Build runtime
    const { omnideck, runtime } = createPluginRuntime({
      pluginId,
      config: opts.config ?? {},
      hostname: opts.hostname ?? "unknown",
      onStateUpdate: opts.onStateUpdate ?? (() => {}),
      onLog: opts.onLog,
    });

    // Dynamic import the plugin module (unique path = fresh import)
    try {
      const mod = await import(codePath);
      const init = mod.default;
      if (typeof init !== "function") {
        throw new Error(`Plugin ${pluginId} does not default-export an init function`);
      }
      await init(omnideck);
      this.plugins.set(pluginId, runtime);
      log.info(`Plugin ${pluginId} loaded successfully`, { sha256: sha256.slice(0, 12) });
    } catch (err) {
      log.error(`Plugin ${pluginId} failed to init`, { err: String(err) });
      throw err;
    }

    // Clean up old version's file (only one .mjs per plugin on disk)
    if (oldMeta && oldMeta.file !== codeFile) {
      const oldPath = join(pluginDir, oldMeta.file);
      try { unlinkSync(oldPath); } catch { /* already gone */ }
    }

    return runtime;
  }

  async loadFromCache(pluginId: string, opts: LoaderOptions = {}): Promise<PluginRuntime> {
    const meta = this.readMeta(pluginId);
    if (!meta) throw new Error(`No cached plugin: ${pluginId}`);
    const codePath = join(this.cacheDir, pluginId, meta.file);
    const code = readFileSync(codePath, "utf-8");
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
      log.info(`Plugin ${pluginId} unloaded`);
    }
  }

  async unloadAll(): Promise<void> {
    for (const [, plugin] of this.plugins) {
      await plugin.destroy();
    }
    this.plugins.clear();
  }

  private readMeta(pluginId: string): CacheMeta | null {
    const metaPath = join(this.cacheDir, pluginId, "meta.json");
    if (!existsSync(metaPath)) return null;
    try {
      const raw = JSON.parse(readFileSync(metaPath, "utf-8")) as Record<string, unknown>;
      return {
        sha256: raw.sha256 as string,
        file: (raw.file as string) ?? "agent.mjs", // backward compat with old meta format
        loadedAt: (raw.loadedAt as string) ?? "",
      };
    } catch {
      return null;
    }
  }
}

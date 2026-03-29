import { readdirSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  PluginManifestSchema,
  type PluginManifest,
  type PluginDistribution,
  type OmniDeckPlugin,
} from "@omnideck/plugin-schema";
import { bundleAgentPlugin, type BundleResult } from "./bundler.js";
import { createLogger } from "../logger.js";

const log = createLogger("registry");

function isValidPlugin(obj: unknown): obj is OmniDeckPlugin {
  if (!obj || typeof obj !== "object") return false;
  const p = obj as Record<string, unknown>;
  return typeof p.id === "string" && typeof p.init === "function" && typeof p.destroy === "function";
}

export class PluginRegistry {
  private pluginsDir: string;
  private manifests = new Map<string, PluginManifest>();
  private agentBundles = new Map<string, BundleResult>();
  private hubPlugins = new Map<string, OmniDeckPlugin>();

  constructor(pluginsDir: string) {
    this.pluginsDir = pluginsDir;
  }

  async loadAll(): Promise<void> {
    if (!existsSync(this.pluginsDir)) return;

    const entries = readdirSync(this.pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      // Follow symlinks — external plugins may be symlinked in
      const fullPath = join(this.pluginsDir, entry.name);
      let isDir = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        try {
          const real = realpathSync(fullPath);
          const stat = require("node:fs").statSync(real);
          isDir = stat.isDirectory();
        } catch {
          log.warn({ dir: entry.name }, "Skipping plugin with broken symlink");
          continue;
        }
      }
      if (!isDir) continue;
      try {
        await this.loadPlugin(entry.name);
      } catch (err) {
        log.error({ err, plugin: entry.name }, "Failed to load plugin");
      }
    }
  }

  private async loadPlugin(dirName: string): Promise<void> {
    const dir = join(this.pluginsDir, dirName);
    // Resolve symlinks for consistent paths
    const resolvedDir = existsSync(dir) ? realpathSync(dir) : dir;
    const manifestPath = join(resolvedDir, "manifest.yaml");
    if (!existsSync(manifestPath)) return;

    const raw = readFileSync(manifestPath, "utf-8");
    const parsed = parseYaml(raw);
    const manifest = PluginManifestSchema.parse(parsed);

    this.manifests.set(manifest.id, manifest);
    log.info({ id: manifest.id, version: manifest.version }, "Plugin loaded");

    // Bundle agent-side code for distribution to agents
    if (manifest.agent) {
      const agentEntry = join(resolvedDir, manifest.agent);
      if (existsSync(agentEntry)) {
        const bundle = await bundleAgentPlugin(agentEntry);
        this.agentBundles.set(manifest.id, bundle);
        log.info(
          { id: manifest.id, sha256: bundle.sha256 },
          "Agent bundle created",
        );
      }
    }

    // Load hub-side plugin code
    if (manifest.hub) {
      const hubEntry = join(resolvedDir, manifest.hub);
      if (existsSync(hubEntry)) {
        try {
          // Use file:// URL for cross-platform dynamic import compatibility
          const mod = await import(pathToFileURL(hubEntry).href);
          // Accept default export or first named export that looks like a plugin
          const plugin = mod.default ?? Object.values(mod).find(isValidPlugin);
          if (isValidPlugin(plugin)) {
            this.hubPlugins.set(manifest.id, plugin);
            log.info({ id: manifest.id }, "Hub plugin loaded");
          } else {
            log.warn({ id: manifest.id }, "Hub plugin file found but no valid OmniDeckPlugin export");
          }
        } catch (err) {
          log.error({ err, id: manifest.id }, "Failed to load hub plugin");
        }
      }
    }
  }

  async reloadPlugin(id: string): Promise<void> {
    this.manifests.delete(id);
    this.agentBundles.delete(id);
    this.hubPlugins.delete(id);

    const entries = readdirSync(this.pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const fullPath = join(this.pluginsDir, entry.name);
      const resolved = existsSync(fullPath) ? realpathSync(fullPath) : fullPath;
      const manifestPath = join(resolved, "manifest.yaml");
      if (!existsSync(manifestPath)) continue;
      const raw = readFileSync(manifestPath, "utf-8");
      const parsed = parseYaml(raw);
      if (parsed.id === id) {
        await this.loadPlugin(entry.name);
        return;
      }
    }
  }

  getManifests(): PluginManifest[] {
    return Array.from(this.manifests.values());
  }

  getManifest(id: string): PluginManifest | undefined {
    return this.manifests.get(id);
  }

  getAgentBundle(id: string): BundleResult | undefined {
    return this.agentBundles.get(id);
  }

  /** Returns hub-side plugins loaded from external plugin directories */
  getHubPlugins(): OmniDeckPlugin[] {
    return Array.from(this.hubPlugins.values());
  }

  /** Returns plugins matching the given platform that have agent code bundled */
  getDistributionList(platform: string): PluginDistribution[] {
    const result: PluginDistribution[] = [];
    for (const [id, manifest] of this.manifests) {
      if (!manifest.agent) continue;
      if (
        manifest.platforms.length > 0 &&
        !manifest.platforms.includes(
          platform as "darwin" | "windows" | "linux",
        )
      )
        continue;
      const bundle = this.agentBundles.get(id);
      if (!bundle) continue;
      result.push({
        id,
        version: manifest.version,
        sha256: bundle.sha256,
        platforms: manifest.platforms,
        hasAgent: true,
      });
    }
    return result;
  }
}

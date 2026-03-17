import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  PluginManifestSchema,
  type PluginManifest,
  type PluginDistribution,
} from "@omnideck/plugin-schema";
import { bundleAgentPlugin, type BundleResult } from "./bundler.js";
import { createLogger } from "../logger.js";

const log = createLogger("registry");

export class PluginRegistry {
  private pluginsDir: string;
  private manifests = new Map<string, PluginManifest>();
  private agentBundles = new Map<string, BundleResult>();

  constructor(pluginsDir: string) {
    this.pluginsDir = pluginsDir;
  }

  async loadAll(): Promise<void> {
    if (!existsSync(this.pluginsDir)) return;

    const entries = readdirSync(this.pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        await this.loadPlugin(entry.name);
      } catch (err) {
        log.error({ err, plugin: entry.name }, "Failed to load plugin");
      }
    }
  }

  private async loadPlugin(dirName: string): Promise<void> {
    const dir = join(this.pluginsDir, dirName);
    const manifestPath = join(dir, "manifest.yaml");
    if (!existsSync(manifestPath)) return;

    const raw = readFileSync(manifestPath, "utf-8");
    const parsed = parseYaml(raw);
    const manifest = PluginManifestSchema.parse(parsed);

    this.manifests.set(manifest.id, manifest);
    log.info({ id: manifest.id, version: manifest.version }, "Plugin loaded");

    if (manifest.agent) {
      const agentEntry = join(dir, manifest.agent);
      if (existsSync(agentEntry)) {
        const bundle = await bundleAgentPlugin(agentEntry);
        this.agentBundles.set(manifest.id, bundle);
        log.info(
          { id: manifest.id, sha256: bundle.sha256 },
          "Agent bundle created",
        );
      }
    }
  }

  async reloadPlugin(id: string): Promise<void> {
    this.manifests.delete(id);
    this.agentBundles.delete(id);

    const entries = readdirSync(this.pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(this.pluginsDir, entry.name, "manifest.yaml");
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

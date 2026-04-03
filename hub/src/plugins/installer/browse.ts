import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { PluginManifestSchema } from "@omnideck/plugin-schema";
import { createLogger } from "../../logger.js";

const log = createLogger("browse");

export interface BrowsePlugin {
  id: string;
  name: string;
  description?: string;
  version: string;
  platforms: string[];
  /** Relative path within the repo (for constructing GitHub URL) */
  dirName: string;
  icon?: string;
  category?: string;
  setup_steps?: string[];
}

/**
 * Scan a directory for plugin subdirectories. Each subdirectory with a valid
 * manifest.yaml is returned as a BrowsePlugin.
 */
export function scanPluginsFromDir(dir: string): BrowsePlugin[] {
  if (!existsSync(dir)) return [];

  const entries = readdirSync(dir, { withFileTypes: true });
  const plugins: BrowsePlugin[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = join(dir, entry.name, "manifest.yaml");
    if (!existsSync(manifestPath)) continue;

    try {
      const raw = readFileSync(manifestPath, "utf-8");
      const parsed = parseYaml(raw);
      const manifest = PluginManifestSchema.parse(parsed);

      plugins.push({
        id: manifest.id,
        name: manifest.name,
        description: (manifest as { description?: string }).description,
        version: manifest.version,
        platforms: manifest.platforms,
        dirName: entry.name,
        icon: manifest.icon,
        category: manifest.category,
        setup_steps: manifest.setup_steps,
      });
    } catch (err) {
      log.warn({ err, dir: entry.name }, "Skipping plugin with invalid manifest");
    }
  }

  return plugins;
}

// --- Tarball-based browse cache ---

export interface BrowseCache {
  sha: string;
  plugins: BrowsePlugin[];
  fetchedAt: number;
}

let cache: BrowseCache | null = null;

export function getCachedBrowse(): BrowseCache | null {
  return cache;
}

export function setCachedBrowse(data: BrowseCache): void {
  cache = data;
}

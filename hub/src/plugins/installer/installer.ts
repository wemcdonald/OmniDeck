import {
  existsSync,
  readFileSync,
  cpSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  PluginManifestSchema,
  type PluginManifest,
} from "@omnideck/plugin-schema";
import { validatePluginDir } from "./validator.js";

export interface InstallResult {
  status: "installed" | "conflict" | "error";
  plugin?: { id: string; name: string; version: string };
  installed?: { version: string };
  incoming?: { version: string };
  errors?: string[];
}

/**
 * Install a plugin from a validated source directory into the plugins directory.
 * If overwrite is false and the plugin already exists, returns conflict with version info.
 */
export function installPluginFromDir(
  sourceDir: string,
  pluginsDir: string,
  overwrite: boolean,
): InstallResult {
  // Validate first
  const validation = validatePluginDir(sourceDir);
  if (!validation.valid || !validation.manifest) {
    return { status: "error", errors: validation.errors };
  }

  const manifest = validation.manifest;
  const targetDir = join(pluginsDir, manifest.id);

  // Check for conflicts
  if (existsSync(targetDir) && !overwrite) {
    const existingManifestPath = join(targetDir, "manifest.yaml");
    let installedVersion = "unknown";
    if (existsSync(existingManifestPath)) {
      try {
        const raw = readFileSync(existingManifestPath, "utf-8");
        const parsed = PluginManifestSchema.parse(parseYaml(raw));
        installedVersion = parsed.version;
      } catch {
        // Use "unknown" if we can't parse
      }
    }
    return {
      status: "conflict",
      installed: { version: installedVersion },
      incoming: { version: manifest.version },
    };
  }

  // Install: remove old, copy new
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true });
  }
  mkdirSync(targetDir, { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true });

  return {
    status: "installed",
    plugin: { id: manifest.id, name: manifest.name, version: manifest.version },
  };
}

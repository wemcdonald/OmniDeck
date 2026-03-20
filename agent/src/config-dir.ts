import { join } from "node:path";
import { homedir, platform } from "node:os";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { createLogger } from "./logger.js";

const log = createLogger("config");

let configDirOverride: string | undefined;

/** Set the config directory from a CLI --config-dir argument. */
export function setConfigDirOverride(dir: string): void {
  configDirOverride = dir;
}

/**
 * Resolve the config directory for the current platform.
 *
 * Priority:
 * 1. --config-dir CLI override
 * 2. Platform-standard location:
 *    - macOS: ~/Library/Application Support/OmniDeck/
 *    - Windows: %APPDATA%\OmniDeck\
 *    - Linux: ~/.config/omnideck/
 */
export function getConfigDir(): string {
  if (configDirOverride) return configDirOverride;

  const home = homedir();
  const os = platform();

  switch (os) {
    case "darwin":
      return join(home, "Library", "Application Support", "OmniDeck");
    case "win32":
      return join(process.env["APPDATA"] ?? join(home, "AppData", "Roaming"), "OmniDeck");
    default:
      // Linux and others: XDG
      return join(process.env["XDG_CONFIG_HOME"] ?? join(home, ".config"), "omnideck");
  }
}

/** Get the credentials file path within the config directory. */
export function getCredentialsPath(): string {
  return join(getConfigDir(), "credentials.json");
}

/** Get the plugins cache directory within the config directory. */
export function getPluginsCacheDir(): string {
  return join(getConfigDir(), "plugins");
}

/**
 * Ensure the config directory exists. If the old ~/.omnideck-agent/ directory
 * contains credentials and the new location doesn't, migrate them.
 */
export function ensureConfigDir(): void {
  const configDir = getConfigDir();
  mkdirSync(configDir, { recursive: true });

  // Migrate from old location if needed
  const oldCredsPath = join(homedir(), ".omnideck-agent", "credentials.json");
  const newCredsPath = join(configDir, "credentials.json");

  if (existsSync(oldCredsPath) && !existsSync(newCredsPath)) {
    try {
      copyFileSync(oldCredsPath, newCredsPath);
      log.info("Migrated credentials from ~/.omnideck-agent/ to new config directory", {
        from: oldCredsPath,
        to: newCredsPath,
      });
    } catch (err) {
      log.warn("Failed to migrate credentials", { err: String(err) });
    }
  }
}

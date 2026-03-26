import {
  mkdtempSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

/**
 * Extract a zip file and locate the plugin directory containing manifest.yaml.
 * Handles two cases:
 * 1. manifest.yaml at zip root
 * 2. manifest.yaml inside a single subdirectory (GitHub "Download ZIP" format)
 *
 * Returns the path to the directory containing manifest.yaml.
 */
export async function extractPluginFromZip(zipPath: string): Promise<string> {
  const extractDir = mkdtempSync(join(tmpdir(), "omnideck-zip-extract-"));

  execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "pipe" });

  // Case 1: manifest.yaml at root
  if (existsSync(join(extractDir, "manifest.yaml"))) {
    return extractDir;
  }

  // Case 2: single subdirectory containing manifest.yaml
  const entries = readdirSync(extractDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("__"));
  if (dirs.length === 1) {
    const subDir = join(extractDir, dirs[0].name);
    if (existsSync(join(subDir, "manifest.yaml"))) {
      return subDir;
    }
  }

  throw new Error(
    "No manifest.yaml found in zip. Expected it at the zip root or inside a single subdirectory.",
  );
}

import { Hono } from "hono";
import AdmZip from "adm-zip";
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, relative, basename, extname } from "node:path";
import { createLogger } from "../../logger.js";

const log = createLogger("backup");

/**
 * Walk a directory recursively and return all file paths relative to root.
 */
function walkDir(dir: string, root = dir): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full, root));
    } else if (entry.isFile()) {
      files.push(relative(root, full));
    }
  }
  return files;
}

/**
 * Mask secret values in secrets.yaml content.
 * Replaces plain-text values with "***" so the zip is safe to share.
 */
function maskSecrets(content: string): string {
  return content.replace(/^(\s*\S+\s*:\s*)(.+)$/gm, "$1***");
}

export function createBackupRoutes(configDir: string): Hono {
  const app = new Hono();

  /** GET /api/backup — download config as zip (secrets.yaml values masked) */
  app.get("/", (c) => {
    try {
      const zip = new AdmZip();
      const files = walkDir(configDir);

      for (const rel of files) {
        const fullPath = join(configDir, rel);
        let content = readFileSync(fullPath);

        // Mask secrets.yaml values to avoid leaking credentials in the backup
        if (basename(rel) === "secrets.yaml" || basename(rel) === "secrets.yml") {
          content = Buffer.from(maskSecrets(content.toString("utf-8")));
        }

        zip.addFile(rel, content);
      }

      const buf = zip.toBuffer();
      const filename = `omnideck-backup-${new Date().toISOString().slice(0, 10)}.zip`;

      c.header("Content-Type", "application/zip");
      c.header("Content-Disposition", `attachment; filename="${filename}"`);
      c.header("Content-Length", String(buf.length));
      return c.body(buf as unknown as ReadableStream);
    } catch (err) {
      log.error({ err }, "Backup generation failed");
      return c.json({ error: String(err) }, 500);
    }
  });

  /** POST /api/backup/restore — upload a zip, validate, backup current, then apply */
  app.post("/restore", async (c) => {
    try {
      const body = await c.req.arrayBuffer();
      if (!body || body.byteLength === 0) {
        return c.json({ error: "No file uploaded" }, 400);
      }

      const zip = new AdmZip(Buffer.from(body));
      const entries = zip.getEntries();

      // Basic validation: must contain at least one .yaml file
      const yamlEntries = entries.filter(
        (e) => !e.isDirectory && (extname(e.entryName) === ".yaml" || extname(e.entryName) === ".yml"),
      );
      if (yamlEntries.length === 0) {
        return c.json({ error: "Invalid backup: no YAML files found" }, 400);
      }

      // Prevent path traversal
      for (const entry of entries) {
        if (entry.entryName.includes("..")) {
          return c.json({ error: `Invalid entry path: ${entry.entryName}` }, 400);
        }
      }

      // Back up current config before overwriting
      const backupDir = `${configDir}.bak-${Date.now()}`;
      if (existsSync(configDir)) {
        cpSync(configDir, backupDir, { recursive: true });
        log.info({ backupDir }, "Current config backed up before restore");
      }

      // Extract zip into configDir
      // Only extract files — skip directories
      mkdirSync(configDir, { recursive: true });
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const dest = join(configDir, entry.entryName);
        const destDir = dest.substring(0, dest.lastIndexOf("/"));
        if (destDir) mkdirSync(destDir, { recursive: true });
        writeFileSync(dest, entry.getData());
      }

      log.info({ files: yamlEntries.length }, "Config restored from backup zip");
      return c.json({
        ok: true,
        files: yamlEntries.length,
        previousBackup: backupDir,
        message: "Config restored. Restart the hub for changes to take full effect.",
      });
    } catch (err) {
      log.error({ err }, "Config restore failed");
      return c.json({ error: String(err) }, 500);
    }
  });

  return app;
}

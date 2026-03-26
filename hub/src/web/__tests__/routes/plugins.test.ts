import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { Hono } from "hono";
import { createPluginInstallRoutes } from "../../routes/plugins.js";

describe("Plugin install routes", () => {
  let pluginsDir: string;
  let app: Hono;

  beforeEach(() => {
    pluginsDir = mkdtempSync(join(tmpdir(), "omnideck-plugins-routes-"));
    app = new Hono();
    app.route("/api/plugins", createPluginInstallRoutes(pluginsDir));
  });

  afterEach(() => {
    rmSync(pluginsDir, { recursive: true });
  });

  describe("POST /api/plugins/install/zip", () => {
    function createZipBuffer(files: Record<string, string>): Buffer {
      const tmpZipDir = mkdtempSync(join(tmpdir(), "omnideck-zipbuf-"));
      const contentDir = join(tmpZipDir, "content");
      mkdirSync(contentDir, { recursive: true });
      for (const [path, content] of Object.entries(files)) {
        const fullPath = join(contentDir, path);
        mkdirSync(join(fullPath, ".."), { recursive: true });
        writeFileSync(fullPath, content);
      }
      const zipPath = join(tmpZipDir, "plugin.zip");
      execSync(`cd "${contentDir}" && zip -r "${zipPath}" .`);
      const { readFileSync } = require("node:fs");
      const buf = readFileSync(zipPath) as Buffer;
      rmSync(tmpZipDir, { recursive: true });
      return buf;
    }

    it("installs a valid plugin from zip upload", async () => {
      const zipBuf = createZipBuffer({
        "manifest.yaml": 'id: zip-test\nname: "Zip Test"\nversion: "1.0.0"\n',
      });

      const formData = new FormData();
      formData.append("file", new Blob([zipBuf], { type: "application/zip" }), "plugin.zip");

      const res = await app.request("/api/plugins/install/zip", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.status).toBe("installed");
      expect(existsSync(join(pluginsDir, "zip-test", "manifest.yaml"))).toBe(true);
    });

    it("returns validation errors for invalid plugin zip", async () => {
      const zipBuf = createZipBuffer({
        "readme.md": "# Not a plugin",
      });

      const formData = new FormData();
      formData.append("file", new Blob([zipBuf], { type: "application/zip" }), "plugin.zip");

      const res = await app.request("/api/plugins/install/zip", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.status).toBe("error");
    });
  });
});

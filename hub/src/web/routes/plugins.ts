import { Hono } from "hono";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLogger } from "../../logger.js";
import {
  parseGitHubUrl,
  fetchPluginFromGitHub,
  fetchLatestSha,
  fetchRepoTarball,
} from "../../plugins/installer/github.js";
import { extractPluginFromZip } from "../../plugins/installer/zip.js";
import { installPluginFromDir } from "../../plugins/installer/installer.js";
import { validatePluginDir } from "../../plugins/installer/validator.js";
import {
  scanPluginsFromDir,
  getCachedBrowse,
  setCachedBrowse,
  type BrowsePlugin,
} from "../../plugins/installer/browse.js";
import { execSync } from "node:child_process";

const log = createLogger("plugin-install");

const CURATED_REPO_OWNER = "wemcdonald";
const CURATED_REPO_NAME = "OmniDeck-plugins";
const MAX_ZIP_SIZE = 5 * 1024 * 1024; // 5MB

interface PluginInstallDeps {
  pluginsDir: string;
  onInstalled?: (pluginId: string) => Promise<void>;
}

export function createPluginInstallRoutes(deps: PluginInstallDeps): Hono {
  const { pluginsDir } = deps;
  const router = new Hono();

  // --- Browse curated plugins ---
  router.get("/browse", async (c) => {
    try {
      // Check if cache is still valid via SHA
      const latestSha = await fetchLatestSha(
        CURATED_REPO_OWNER,
        CURATED_REPO_NAME,
      );
      const cached = getCachedBrowse();
      if (cached && cached.sha === latestSha) {
        return c.json({ plugins: cached.plugins });
      }

      // Download tarball and extract
      const tarballPath = await fetchRepoTarball(
        CURATED_REPO_OWNER,
        CURATED_REPO_NAME,
      );

      // Extract tarball
      const extractDir = mkdtempSync(join(tmpdir(), "omnideck-browse-extract-"));
      execSync(`tar -xzf "${tarballPath}" -C "${extractDir}" --strip-components=1`, {
        stdio: "pipe",
      });

      // Scan for plugins
      const plugins = scanPluginsFromDir(extractDir);

      // Update cache
      setCachedBrowse({ sha: latestSha, plugins, fetchedAt: Date.now() });

      // Cleanup
      rmSync(extractDir, { recursive: true, force: true });
      rmSync(tarballPath, { force: true });

      return c.json({ plugins });
    } catch (err) {
      log.error({ err }, "Failed to browse curated plugins");
      return c.json(
        { status: "error", errors: ["Failed to fetch plugin list from GitHub"] },
        502,
      );
    }
  });

  // --- Install from GitHub URL ---
  router.post("/install/github", async (c) => {
    try {
      const body = (await c.req.json()) as { url: string; overwrite?: boolean };
      if (!body.url) {
        return c.json({ status: "error", errors: ["URL is required"] }, 400);
      }

      const ref = parseGitHubUrl(body.url);
      if (!ref) {
        return c.json(
          { status: "error", errors: ["Invalid GitHub URL. Expected: https://github.com/owner/repo or owner/repo/path"] },
          400,
        );
      }

      // Fetch plugin files
      const tmpDir = await fetchPluginFromGitHub(ref);

      // Validate before installing
      const validation = validatePluginDir(tmpDir);
      if (!validation.valid) {
        rmSync(tmpDir, { recursive: true, force: true });
        return c.json({ status: "error", errors: validation.errors }, 400);
      }

      // Install
      const result = installPluginFromDir(
        tmpDir,
        pluginsDir,
        body.overwrite ?? false,
      );

      rmSync(tmpDir, { recursive: true, force: true });

      if (result.status === "error") {
        return c.json(result, 400);
      }
      if (result.status === "conflict") {
        return c.json(result, 409);
      }

      // Hot-reload the newly installed plugin
      if (result.plugin?.id && deps.onInstalled) {
        await deps.onInstalled(result.plugin.id).catch((err) =>
          log.error({ err, pluginId: result.plugin?.id }, "Failed to hot-reload plugin after install"),
        );
      }

      return c.json(result);
    } catch (err) {
      log.error({ err }, "GitHub plugin install failed");
      return c.json(
        { status: "error", errors: [`Failed to fetch from GitHub: ${(err as Error).message}`] },
        502,
      );
    }
  });

  // --- Install from zip upload ---
  router.post("/install/zip", async (c) => {
    try {
      const contentType = c.req.header("content-type") ?? "";
      if (!contentType.includes("multipart/form-data")) {
        return c.json(
          { status: "error", errors: ["Expected multipart/form-data"] },
          400,
        );
      }

      const formData = await c.req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return c.json({ status: "error", errors: ["No file uploaded"] }, 400);
      }

      if (file.size > MAX_ZIP_SIZE) {
        return c.json(
          { status: "error", errors: [`File too large (max ${MAX_ZIP_SIZE / 1024 / 1024}MB)`] },
          400,
        );
      }

      // Write uploaded file to temp location
      const tmpZipDir = mkdtempSync(join(tmpdir(), "omnideck-upload-"));
      const zipPath = join(tmpZipDir, "upload.zip");
      const buffer = Buffer.from(await file.arrayBuffer());
      writeFileSync(zipPath, buffer);

      // Extract and find plugin dir
      let pluginDir: string;
      try {
        pluginDir = await extractPluginFromZip(zipPath);
      } catch (err) {
        rmSync(tmpZipDir, { recursive: true, force: true });
        return c.json(
          { status: "error", errors: [(err as Error).message] },
          400,
        );
      }

      // Check for overwrite query param
      const overwrite = c.req.query("overwrite") === "true";

      // Install
      const result = installPluginFromDir(pluginDir, pluginsDir, overwrite);

      rmSync(tmpZipDir, { recursive: true, force: true });

      if (result.status === "error") {
        return c.json(result, 400);
      }
      if (result.status === "conflict") {
        return c.json(result, 409);
      }

      // Hot-reload the newly installed plugin
      if (result.plugin?.id && deps.onInstalled) {
        await deps.onInstalled(result.plugin.id).catch((err) =>
          log.error({ err, pluginId: result.plugin?.id }, "Failed to hot-reload plugin after install"),
        );
      }

      return c.json(result);
    } catch (err) {
      log.error({ err }, "Zip plugin install failed");
      return c.json(
        { status: "error", errors: [`Installation failed: ${(err as Error).message}`] },
        500,
      );
    }
  });

  // --- Validate (preview) a plugin from GitHub URL without installing ---
  router.post("/validate/github", async (c) => {
    try {
      const body = (await c.req.json()) as { url: string };
      if (!body.url) {
        return c.json({ status: "error", errors: ["URL is required"] }, 400);
      }

      const ref = parseGitHubUrl(body.url);
      if (!ref) {
        return c.json(
          { status: "error", errors: ["Invalid GitHub URL"] },
          400,
        );
      }

      const tmpDir = await fetchPluginFromGitHub(ref);
      const validation = validatePluginDir(tmpDir);
      rmSync(tmpDir, { recursive: true, force: true });

      if (!validation.valid) {
        return c.json({ status: "error", errors: validation.errors }, 400);
      }

      return c.json({ status: "valid", manifest: validation.manifest });
    } catch (err) {
      return c.json(
        { status: "error", errors: [`Failed to fetch: ${(err as Error).message}`] },
        502,
      );
    }
  });

  return router;
}

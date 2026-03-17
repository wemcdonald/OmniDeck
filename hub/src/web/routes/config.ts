import { Hono } from "hono";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { unlinkSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export function createConfigRoutes(configDir: string): Hono {
  const router = new Hono();

  // --- Pages ---

  router.get("/pages", (c) => {
    const pagesDir = join(configDir, "pages");
    if (!existsSync(pagesDir)) return c.json([]);
    const files = readdirSync(pagesDir).filter(
      (f) => extname(f) === ".yaml" || extname(f) === ".yml"
    );
    const pages = files.map((f) => {
      const raw = readFileSync(join(pagesDir, f), "utf-8");
      return parseYaml(raw);
    });
    return c.json(pages);
  });

  router.get("/pages/:id", (c) => {
    const id = c.req.param("id");
    const pagePath = join(configDir, "pages", `${id}.yaml`);
    if (!existsSync(pagePath)) return c.json({ error: "Page not found" }, 404);
    const raw = readFileSync(pagePath, "utf-8");
    return c.json(parseYaml(raw));
  });

  router.put("/pages/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const pagePath = join(configDir, "pages", `${id}.yaml`);
    writeFileSync(pagePath, stringifyYaml(body));
    return c.json({ ok: true });
  });

  router.post("/pages", async (c) => {
    const body = (await c.req.json()) as { page: string; [k: string]: unknown };
    const pagePath = join(configDir, "pages", `${body.page}.yaml`);
    writeFileSync(pagePath, stringifyYaml(body));
    return c.json({ ok: true }, 201);
  });

  router.delete("/pages/:id", (c) => {
    const id = c.req.param("id");
    const pagePath = join(configDir, "pages", `${id}.yaml`);
    if (!existsSync(pagePath)) return c.json({ error: "Page not found" }, 404);
    unlinkSync(pagePath);
    return c.json({ ok: true });
  });

  // --- Plugins ---

  router.get("/plugins", (c) => {
    const mainPath = join(configDir, "main.yaml");
    if (!existsSync(mainPath)) return c.json({});
    const raw = readFileSync(mainPath, "utf-8");
    const config = parseYaml(raw) as Record<string, unknown>;
    return c.json((config.plugins as Record<string, unknown>) ?? {});
  });

  router.put("/plugins/:id", async (c) => {
    const pluginId = c.req.param("id");
    const newPluginConfig = await c.req.json();
    const mainPath = join(configDir, "main.yaml");
    const raw = existsSync(mainPath) ? readFileSync(mainPath, "utf-8") : "";
    const config = (parseYaml(raw) ?? {}) as Record<string, unknown>;
    const plugins = (config.plugins ?? {}) as Record<string, unknown>;
    plugins[pluginId] = newPluginConfig;
    config.plugins = plugins;
    writeFileSync(mainPath, stringifyYaml(config));
    return c.json({ ok: true });
  });

  // --- Raw YAML files ---

  router.get("/raw/:filename", (c) => {
    const filename = c.req.param("filename");
    // Security: only allow simple filenames, no path traversal
    if (filename !== basename(filename)) {
      return c.json({ error: "Invalid filename" }, 400);
    }
    const filePath = join(configDir, filename);
    if (!existsSync(filePath)) return c.json({ error: "File not found" }, 404);
    const content = readFileSync(filePath, "utf-8");
    return c.json({ content });
  });

  router.put("/raw/:filename", async (c) => {
    const filename = c.req.param("filename");
    // Security: only allow simple filenames, no path traversal
    if (filename !== basename(filename)) {
      return c.json({ error: "Invalid filename" }, 400);
    }
    const body = (await c.req.json()) as { content: string };
    // Validate YAML before writing
    try {
      parseYaml(body.content);
    } catch {
      return c.json({ error: "Invalid YAML" }, 400);
    }
    const filePath = join(configDir, filename);
    writeFileSync(filePath, body.content);
    return c.json({ ok: true });
  });

  return router;
}

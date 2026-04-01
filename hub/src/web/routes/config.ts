import { Hono } from "hono";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { unlinkSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { parseDocument, stringify as stringifyYaml } from "yaml";

/** Parse YAML tolerating !secret tags (leaves them as plain strings). */
function parseYaml(content: string): unknown {
  const doc = parseDocument(content, {
    customTags: [{ tag: "!secret", identify: () => false, resolve: (str: string) => str }],
  });
  return doc.toJSON();
}

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
    const pagesDir = join(configDir, "pages");
    const pagePath = join(pagesDir, `${id}.yaml`);
    if (!existsSync(pagePath)) return c.json({ error: "Page not found" }, 404);
    const allFiles = existsSync(pagesDir)
      ? readdirSync(pagesDir).filter((f) => extname(f) === ".yaml" || extname(f) === ".yml")
      : [];
    if (allFiles.length <= 1) return c.json({ error: "Cannot delete the last page" }, 400);
    unlinkSync(pagePath);
    // If the deleted page was the default, update default_page to the first remaining page
    const configPath = join(configDir, "config.yaml");
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf-8");
      const config = (parseYaml(raw) ?? {}) as Record<string, unknown>;
      const deck = (config.deck ?? {}) as Record<string, unknown>;
      if (deck.default_page === id) {
        const remaining = allFiles.filter((f) => basename(f, extname(f)) !== id);
        if (remaining.length > 0) {
          deck.default_page = basename(remaining[0], extname(remaining[0]));
          config.deck = deck;
          writeFileSync(configPath, stringifyYaml(config));
        }
      }
    }
    return c.json({ ok: true });
  });

  // --- Plugins ---

  // Read plugins from all root YAML files (merged)
  function loadPlugins(): Record<string, unknown> {
    if (!existsSync(configDir)) return {};
    const files = readdirSync(configDir).filter(
      (f) => (extname(f) === ".yaml" || extname(f) === ".yml") && f !== "secrets.yaml"
    );
    let plugins: Record<string, unknown> = {};
    for (const file of files.sort()) {
      const raw = readFileSync(join(configDir, file), "utf-8");
      const parsed = parseYaml(raw) as Record<string, unknown> | null;
      if (parsed?.plugins) {
        plugins = { ...plugins, ...(parsed.plugins as Record<string, unknown>) };
      }
    }
    return plugins;
  }

  router.get("/plugins", (c) => {
    return c.json(loadPlugins());
  });

  router.put("/plugins/:id", async (c) => {
    const pluginId = c.req.param("id");
    const newPluginConfig = await c.req.json();
    const configPath = join(configDir, "config.yaml");
    const raw = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";
    const config = (parseYaml(raw) ?? {}) as Record<string, unknown>;
    const plugins = (config.plugins ?? {}) as Record<string, unknown>;
    plugins[pluginId] = newPluginConfig;
    config.plugins = plugins;
    writeFileSync(configPath, stringifyYaml(config));
    return c.json({ ok: true });
  });

  // --- Deck config (brightness, default_page, etc.) ---

  function loadDeckConfig(): Record<string, unknown> {
    const configPath = join(configDir, "config.yaml");
    if (!existsSync(configPath)) return {};
    const raw = readFileSync(configPath, "utf-8");
    const config = (parseYaml(raw) ?? {}) as Record<string, unknown>;
    return (config.deck ?? {}) as Record<string, unknown>;
  }

  router.get("/deck", (c) => c.json(loadDeckConfig()));

  router.put("/deck", async (c) => {
    const newDeck = await c.req.json();
    const configPath = join(configDir, "config.yaml");
    const raw = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";
    const config = (parseYaml(raw) ?? {}) as Record<string, unknown>;
    config.deck = { ...(config.deck as Record<string, unknown> ?? {}), ...newDeck };
    writeFileSync(configPath, stringifyYaml(config));
    return c.json({ ok: true });
  });

  // --- Modes ---

  function loadModes(): Record<string, unknown> {
    const configPath = join(configDir, "config.yaml");
    if (!existsSync(configPath)) return {};
    const raw = readFileSync(configPath, "utf-8");
    const config = (parseYaml(raw) ?? {}) as Record<string, unknown>;
    return (config.modes ?? {}) as Record<string, unknown>;
  }

  router.get("/modes", (c) => {
    return c.json(loadModes());
  });

  router.get("/modes/active", (c) => {
    // Read active mode from state store if available (passed via closure)
    // For now, return from config — the frontend will get live updates via WebSocket
    return c.json(loadModes());
  });

  router.put("/modes", async (c) => {
    const newModes = await c.req.json();
    const configPath = join(configDir, "config.yaml");
    const raw = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";
    const config = (parseYaml(raw) ?? {}) as Record<string, unknown>;
    config.modes = newModes;
    writeFileSync(configPath, stringifyYaml(config));
    return c.json({ ok: true });
  });

  router.put("/modes/:id", async (c) => {
    const modeId = c.req.param("id");
    const modeConfig = await c.req.json();
    const configPath = join(configDir, "config.yaml");
    const raw = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";
    const config = (parseYaml(raw) ?? {}) as Record<string, unknown>;
    const modes = (config.modes ?? {}) as Record<string, unknown>;
    modes[modeId] = modeConfig;
    config.modes = modes;
    writeFileSync(configPath, stringifyYaml(config));
    return c.json({ ok: true });
  });

  router.delete("/modes/:id", (c) => {
    const modeId = c.req.param("id");
    const configPath = join(configDir, "config.yaml");
    if (!existsSync(configPath)) return c.json({ error: "Config not found" }, 404);
    const raw = readFileSync(configPath, "utf-8");
    const config = (parseYaml(raw) ?? {}) as Record<string, unknown>;
    const modes = (config.modes ?? {}) as Record<string, unknown>;
    if (!(modeId in modes)) return c.json({ error: "Mode not found" }, 404);
    delete modes[modeId];
    config.modes = modes;
    writeFileSync(configPath, stringifyYaml(config));
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

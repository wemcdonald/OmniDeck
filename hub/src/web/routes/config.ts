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
    const plugins = loadPlugins();
    // Also return which keys are secret references so UI can show masked inputs
    const secretRefs: Record<string, string[]> = {};
    try {
      const configPath = join(configDir, "config.yaml");
      if (existsSync(configPath)) {
        const raw = readFileSync(configPath, "utf-8");
        const doc = parseDocument(raw, {
          customTags: [{ tag: "!secret", identify: () => false, resolve: (str: string) => str }],
        });
        const pluginsNode = doc.get("plugins") as any;
        if (pluginsNode?.items) {
          for (const pluginItem of pluginsNode.items) {
            const pluginId = pluginItem.key?.value ?? pluginItem.key;
            const secretFields: string[] = [];
            if (pluginItem.value?.items) {
              for (const field of pluginItem.value.items) {
                if (field.value?.tag === "!secret") {
                  secretFields.push(String(field.key?.value ?? field.key));
                }
              }
            }
            if (secretFields.length > 0) secretRefs[String(pluginId)] = secretFields;
          }
        }
      }
    } catch { /* ignore */ }
    return c.json({ plugins, secretRefs });
  });

  router.put("/plugins/:id", async (c) => {
    const pluginId = c.req.param("id");
    const newPluginConfig = await c.req.json() as Record<string, unknown>;
    const configPath = join(configDir, "config.yaml");
    const raw = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";

    // Parse with secret tags intact so we can preserve them
    const doc = parseDocument(raw, {
      customTags: [{ tag: "!secret", identify: () => false, resolve: (str: string) => str }],
    });
    const config = doc.toJSON() as Record<string, unknown>;

    // Build a map of which keys had !secret tags in the existing config
    const secretKeys = new Set<string>();
    try {
      const pluginsNode = doc.get("plugins") as any;
      const pluginNode = pluginsNode?.get(pluginId) as any;
      if (pluginNode?.items) {
        for (const item of pluginNode.items) {
          const key = item.key?.value ?? item.key;
          const val = item.value;
          if (val?.tag === "!secret") {
            secretKeys.add(String(key));
          }
        }
      }
    } catch { /* ignore */ }

    // For fields that had !secret tags: only update if the incoming value looks like
    // a new real value (not the same secret key name that was shown in the UI read)
    const plugins = (config.plugins ?? {}) as Record<string, unknown>;
    const existingPlugin = (plugins[pluginId] ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(newPluginConfig)) {
      if (secretKeys.has(key) && val === existingPlugin[key]) {
        // Value unchanged — keep the !secret tag by preserving the existing raw value
        // We do this by not including it in the merged object and letting the YAML preserve it
        merged[key] = val;
      } else {
        merged[key] = val;
      }
    }

    // Re-parse with secret preservation using YAML document manipulation
    const rawDoc = parseDocument(raw, {
      customTags: [{ tag: "!secret", identify: () => false, resolve: (str: string) => str }],
    });
    const configObj = rawDoc.toJSON() as Record<string, unknown>;
    const pluginsObj = (configObj.plugins ?? {}) as Record<string, unknown>;

    // For secret keys where value is unchanged (equals the secret key name that was displayed),
    // we reconstruct the entry preserving the !secret tag in the YAML string
    // Simplest approach: write the merged config but re-insert !secret for unchanged secret fields
    const finalPlugin: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(newPluginConfig)) {
      if (secretKeys.has(key)) {
        const existingVal = ((pluginsObj[pluginId] ?? {}) as Record<string, unknown>)[key];
        // If value unchanged, skip (will be preserved by raw doc manipulation below)
        if (val === existingVal) continue; // keep existing !secret in doc
        // New value — write as plain string
        finalPlugin[key] = val;
      } else {
        finalPlugin[key] = val;
      }
    }

    // Update YAML doc in-place to preserve !secret tags for unchanged keys
    try {
      const pluginsNode = rawDoc.get("plugins") as any;
      if (!pluginsNode) {
        rawDoc.set("plugins", { [pluginId]: finalPlugin });
      } else {
        const pluginNode = pluginsNode.get(pluginId) as any;
        if (!pluginNode) {
          pluginsNode.set(pluginId, finalPlugin);
        } else {
          // Update each key individually — skip secret keys with unchanged values
          for (const [key, val] of Object.entries(newPluginConfig)) {
            if (secretKeys.has(key)) {
              const existingVal = ((pluginsObj[pluginId] ?? {}) as Record<string, unknown>)[key];
              if (val === existingVal) continue; // preserve !secret node
            }
            pluginNode.set(key, val);
          }
          // Remove keys no longer in the new config
          const existingKeys = Object.keys((pluginsObj[pluginId] ?? {}) as Record<string, unknown>);
          for (const key of existingKeys) {
            if (!(key in newPluginConfig)) {
              pluginNode.delete(key);
            }
          }
        }
      }
    } catch (err) {
      // Fallback: plain write (loses !secret tags)
      const fallbackConfig = rawDoc.toJSON() as Record<string, unknown>;
      (fallbackConfig.plugins as Record<string, unknown>)[pluginId] = newPluginConfig;
      writeFileSync(configPath, stringifyYaml(fallbackConfig));
      return c.json({ ok: true });
    }

    writeFileSync(configPath, rawDoc.toString());
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

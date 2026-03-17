import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PluginLoader } from "../loader.js";

describe("PluginLoader", () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "omnideck-plugins-"));
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true });
  });

  it("loads a plugin from code string", async () => {
    const loader = new PluginLoader(cacheDir);
    const code = `export default function init(omnideck) {
      omnideck.onAction("test", async () => ({ success: true }));
    }`;
    const plugin = await loader.loadFromCode("test-plugin", code, "abc123");
    expect(plugin).toBeDefined();
    expect(plugin.id).toBe("test-plugin");
  });

  it("caches plugin to disk and loads from cache", async () => {
    const loader = new PluginLoader(cacheDir);
    const code = `export default function init(omnideck) {
      omnideck.setState("loaded", true);
    }`;
    await loader.loadFromCode("cached-plugin", code, "sha-1");

    // Create new loader instance (simulating restart)
    const loader2 = new PluginLoader(cacheDir);
    const hasCached = loader2.hasCached("cached-plugin", "sha-1");
    expect(hasCached).toBe(true);
  });

  it("detects stale cache by sha mismatch", async () => {
    const loader = new PluginLoader(cacheDir);
    const code = `export default function init(o) {}`;
    await loader.loadFromCode("my-plugin", code, "sha-old");

    const loader2 = new PluginLoader(cacheDir);
    expect(loader2.hasCached("my-plugin", "sha-new")).toBe(false);
  });

  it("calls plugin init with omnideck object", async () => {
    const loader = new PluginLoader(cacheDir);
    const code = `export default function init(omnideck) {
      omnideck.onAction("do_thing", async () => ({ success: true }));
    }`;
    const plugin = await loader.loadFromCode("init-test", code, "abc");
    expect(plugin.actions.has("do_thing")).toBe(true);
  });
});

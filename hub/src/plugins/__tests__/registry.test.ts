import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PluginRegistry } from "../registry.js";

describe("PluginRegistry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "omnideck-registry-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  function createPlugin(
    id: string,
    opts: { agent?: boolean; platforms?: string[] } = {},
  ) {
    const dir = join(tmpDir, id);
    mkdirSync(dir, { recursive: true });

    const platformsLine =
      opts.platforms && opts.platforms.length > 0
        ? `platforms:\n${opts.platforms.map((p) => `  - ${p}`).join("\n")}\n`
        : "";

    const agentLine = opts.agent !== false ? `agent: agent.ts\n` : "";

    writeFileSync(
      join(dir, "manifest.yaml"),
      `id: ${id}\nname: ${id}\nversion: 1.0.0\nhub: hub.ts\n${agentLine}${platformsLine}`,
    );

    writeFileSync(
      join(dir, "hub.ts"),
      `export default { id: "${id}", name: "${id}", version: "1.0.0", async init() {}, async destroy() {} };`,
    );

    if (opts.agent !== false) {
      writeFileSync(
        join(dir, "agent.ts"),
        `export default function init(o) { o.onAction("test", async () => ({ success: true })); }`,
      );
    }
  }

  it("loads plugin manifests from a directory", async () => {
    createPlugin("test-plugin");
    const registry = new PluginRegistry(tmpDir);
    await registry.loadAll();
    expect(registry.getManifests()).toHaveLength(1);
    expect(registry.getManifests()[0].id).toBe("test-plugin");
  });

  it("bundles agent-side code and stores the result", async () => {
    createPlugin("my-plugin");
    const registry = new PluginRegistry(tmpDir);
    await registry.loadAll();
    const bundle = registry.getAgentBundle("my-plugin");
    expect(bundle).toBeDefined();
    expect(bundle!.code).toContain("onAction");
    expect(bundle!.sha256).toBeDefined();
  });

  it("does not create agent bundle for hub-only plugins", async () => {
    createPlugin("hub-only", { agent: false });
    const registry = new PluginRegistry(tmpDir);
    await registry.loadAll();
    const bundle = registry.getAgentBundle("hub-only");
    expect(bundle).toBeUndefined();
  });

  it("filters distribution list by platform", async () => {
    createPlugin("mac-plugin", { platforms: ["darwin"] });
    createPlugin("all-plugin");
    const registry = new PluginRegistry(tmpDir);
    await registry.loadAll();
    const darwinPlugins = registry.getDistributionList("darwin");
    expect(darwinPlugins).toHaveLength(2);
    const windowsPlugins = registry.getDistributionList("windows");
    expect(windowsPlugins).toHaveLength(1);
    expect(windowsPlugins[0].id).toBe("all-plugin");
  });

  it("reloads a single plugin", async () => {
    createPlugin("reloadable");
    const registry = new PluginRegistry(tmpDir);
    await registry.loadAll();
    expect(registry.getManifest("reloadable")).toBeDefined();
    const bundleBefore = registry.getAgentBundle("reloadable");
    expect(bundleBefore).toBeDefined();

    // Reload and verify it re-populates
    await registry.reloadPlugin("reloadable");
    expect(registry.getManifest("reloadable")).toBeDefined();
    expect(registry.getAgentBundle("reloadable")).toBeDefined();
  });
});

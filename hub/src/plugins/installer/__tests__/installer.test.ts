import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installPluginFromDir } from "../installer.js";

describe("installPluginFromDir", () => {
  let pluginsDir: string;
  let sourceDir: string;

  beforeEach(() => {
    pluginsDir = mkdtempSync(join(tmpdir(), "omnideck-plugins-"));
    sourceDir = mkdtempSync(join(tmpdir(), "omnideck-source-"));
  });

  afterEach(() => {
    rmSync(pluginsDir, { recursive: true });
    rmSync(sourceDir, { recursive: true });
  });

  it("installs a valid plugin to the plugins directory", () => {
    writeFileSync(
      join(sourceDir, "manifest.yaml"),
      'id: my-plugin\nname: "My Plugin"\nversion: "1.0.0"\nagent: agent.ts\n',
    );
    writeFileSync(join(sourceDir, "agent.ts"), "export default {}");

    const result = installPluginFromDir(sourceDir, pluginsDir, false);
    expect(result.status).toBe("installed");
    expect(result.plugin!.id).toBe("my-plugin");
    expect(existsSync(join(pluginsDir, "my-plugin", "manifest.yaml"))).toBe(true);
    expect(existsSync(join(pluginsDir, "my-plugin", "agent.ts"))).toBe(true);
  });

  it("returns validation errors for invalid plugin", () => {
    writeFileSync(join(sourceDir, "agent.ts"), "export default {}");

    const result = installPluginFromDir(sourceDir, pluginsDir, false);
    expect(result.status).toBe("error");
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("returns conflict when plugin already exists", () => {
    writeFileSync(
      join(sourceDir, "manifest.yaml"),
      'id: my-plugin\nname: "My Plugin"\nversion: "2.0.0"\nagent: agent.ts\n',
    );
    writeFileSync(join(sourceDir, "agent.ts"), "export default {}");

    // Pre-install an older version
    mkdirSync(join(pluginsDir, "my-plugin"));
    writeFileSync(
      join(pluginsDir, "my-plugin", "manifest.yaml"),
      'id: my-plugin\nname: "My Plugin"\nversion: "1.0.0"\n',
    );

    const result = installPluginFromDir(sourceDir, pluginsDir, false);
    expect(result.status).toBe("conflict");
    expect(result.installed!.version).toBe("1.0.0");
    expect(result.incoming!.version).toBe("2.0.0");
  });

  it("overwrites existing plugin when overwrite is true", () => {
    writeFileSync(
      join(sourceDir, "manifest.yaml"),
      'id: my-plugin\nname: "My Plugin"\nversion: "2.0.0"\nagent: agent.ts\n',
    );
    writeFileSync(join(sourceDir, "agent.ts"), "export default {}");

    // Pre-install an older version
    mkdirSync(join(pluginsDir, "my-plugin"));
    writeFileSync(
      join(pluginsDir, "my-plugin", "manifest.yaml"),
      'id: my-plugin\nname: "My Plugin"\nversion: "1.0.0"\n',
    );

    const result = installPluginFromDir(sourceDir, pluginsDir, true);
    expect(result.status).toBe("installed");
    const installed = readFileSync(
      join(pluginsDir, "my-plugin", "manifest.yaml"),
      "utf-8",
    );
    expect(installed).toContain("2.0.0");
  });
});

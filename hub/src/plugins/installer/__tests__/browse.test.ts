import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanPluginsFromDir } from "../browse.js";

describe("scanPluginsFromDir", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "omnideck-browse-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it("finds all valid plugins in a directory", () => {
    mkdirSync(join(tmpDir, "plugin-a"));
    writeFileSync(
      join(tmpDir, "plugin-a", "manifest.yaml"),
      'id: plugin-a\nname: "Plugin A"\nversion: "1.0.0"\ndescription: "First plugin"\n',
    );

    mkdirSync(join(tmpDir, "plugin-b"));
    writeFileSync(
      join(tmpDir, "plugin-b", "manifest.yaml"),
      'id: plugin-b\nname: "Plugin B"\nversion: "2.0.0"\n',
    );

    const plugins = scanPluginsFromDir(tmpDir);
    expect(plugins).toHaveLength(2);
    expect(plugins.find((p) => p.id === "plugin-a")?.description).toBe("First plugin");
    expect(plugins.find((p) => p.id === "plugin-b")?.version).toBe("2.0.0");
  });

  it("skips directories without manifest.yaml", () => {
    mkdirSync(join(tmpDir, "not-a-plugin"));
    writeFileSync(join(tmpDir, "not-a-plugin", "readme.md"), "# Hi");

    mkdirSync(join(tmpDir, "real-plugin"));
    writeFileSync(
      join(tmpDir, "real-plugin", "manifest.yaml"),
      'id: real\nname: "Real"\nversion: "1.0.0"\n',
    );

    const plugins = scanPluginsFromDir(tmpDir);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe("real");
  });

  it("skips plugins with invalid manifests", () => {
    mkdirSync(join(tmpDir, "bad-plugin"));
    writeFileSync(
      join(tmpDir, "bad-plugin", "manifest.yaml"),
      "not: valid: yaml: [",
    );

    mkdirSync(join(tmpDir, "good-plugin"));
    writeFileSync(
      join(tmpDir, "good-plugin", "manifest.yaml"),
      'id: good\nname: "Good"\nversion: "1.0.0"\n',
    );

    const plugins = scanPluginsFromDir(tmpDir);
    expect(plugins).toHaveLength(1);
  });

  it("returns empty array for empty directory", () => {
    const plugins = scanPluginsFromDir(tmpDir);
    expect(plugins).toEqual([]);
  });
});

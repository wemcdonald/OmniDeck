import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validatePluginDir } from "../validator.js";

describe("validatePluginDir", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "omnideck-validator-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it("returns valid result for a correct plugin directory", () => {
    writeFileSync(
      join(tmpDir, "manifest.yaml"),
      'id: test-plugin\nname: "Test Plugin"\nversion: "1.0.0"\nagent: agent.ts\n',
    );
    writeFileSync(join(tmpDir, "agent.ts"), "export default {}");

    const result = validatePluginDir(tmpDir);
    expect(result.valid).toBe(true);
    expect(result.manifest!.id).toBe("test-plugin");
    expect(result.manifest!.name).toBe("Test Plugin");
  });

  it("returns error when manifest.yaml is missing", () => {
    writeFileSync(join(tmpDir, "agent.ts"), "export default {}");

    const result = validatePluginDir(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("No manifest.yaml found");
  });

  it("returns errors for invalid manifest fields", () => {
    writeFileSync(
      join(tmpDir, "manifest.yaml"),
      'version: "1.0.0"\n',
    );

    const result = validatePluginDir(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("returns error when referenced hub file is missing", () => {
    writeFileSync(
      join(tmpDir, "manifest.yaml"),
      'id: test-plugin\nname: "Test"\nversion: "1.0.0"\nhub: hub.ts\n',
    );

    const result = validatePluginDir(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Manifest references hub file 'hub.ts' but it was not found");
  });

  it("returns error when referenced agent file is missing", () => {
    writeFileSync(
      join(tmpDir, "manifest.yaml"),
      'id: test-plugin\nname: "Test"\nversion: "1.0.0"\nagent: agent.ts\n',
    );

    const result = validatePluginDir(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Manifest references agent file 'agent.ts' but it was not found");
  });

  it("accepts plugin with description field", () => {
    writeFileSync(
      join(tmpDir, "manifest.yaml"),
      'id: test-plugin\nname: "Test"\nversion: "1.0.0"\ndescription: "A test plugin"\n',
    );

    const result = validatePluginDir(tmpDir);
    expect(result.valid).toBe(true);
    expect(result.manifest!.description).toBe("A test plugin");
  });
});

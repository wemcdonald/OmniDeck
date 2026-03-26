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
import { extractPluginFromZip } from "../zip.js";

describe("extractPluginFromZip", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "omnideck-zip-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  function createZip(structure: Record<string, string>, zipName = "plugin.zip"): string {
    const contentDir = join(tmpDir, "content");
    mkdirSync(contentDir, { recursive: true });
    for (const [path, content] of Object.entries(structure)) {
      const fullPath = join(contentDir, path);
      mkdirSync(join(fullPath, ".."), { recursive: true });
      writeFileSync(fullPath, content);
    }
    const zipPath = join(tmpDir, zipName);
    execSync(`cd "${contentDir}" && zip -r "${zipPath}" .`);
    return zipPath;
  }

  it("extracts plugin with manifest at zip root", async () => {
    const zipPath = createZip({
      "manifest.yaml": 'id: test\nname: "Test"\nversion: "1.0.0"\n',
      "agent.ts": "export default {}",
    });

    const dir = await extractPluginFromZip(zipPath);
    expect(existsSync(join(dir, "manifest.yaml"))).toBe(true);
    expect(existsSync(join(dir, "agent.ts"))).toBe(true);
  });

  it("extracts plugin with manifest in single subdirectory", async () => {
    const zipPath = createZip({
      "my-plugin/manifest.yaml": 'id: test\nname: "Test"\nversion: "1.0.0"\n',
      "my-plugin/agent.ts": "export default {}",
    });

    const dir = await extractPluginFromZip(zipPath);
    expect(existsSync(join(dir, "manifest.yaml"))).toBe(true);
    expect(existsSync(join(dir, "agent.ts"))).toBe(true);
  });

  it("throws when no manifest.yaml is found anywhere", async () => {
    const zipPath = createZip({
      "readme.md": "# Hello",
    });

    await expect(extractPluginFromZip(zipPath)).rejects.toThrow(
      "No manifest.yaml found",
    );
  });
});

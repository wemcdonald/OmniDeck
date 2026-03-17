// hub/src/config/__tests__/loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../loader.js";

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "omnideck-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it("loads a simple main.yaml", async () => {
    writeFileSync(
      join(tmpDir, "main.yaml"),
      `deck:\n  brightness: 80\n  default_page: home\n`
    );
    const config = await loadConfig(tmpDir);
    expect(config.deck.brightness).toBe(80);
    expect(config.deck.default_page).toBe("home");
  });

  it("resolves !secret tags from secrets.yaml", async () => {
    writeFileSync(
      join(tmpDir, "main.yaml"),
      `plugins:\n  home-assistant:\n    token: !secret ha_token\n`
    );
    // secrets.yaml lives one level up from config dir (per architecture)
    writeFileSync(
      join(tmpDir, "..", "secrets.yaml"),
      `ha_token: "my-secret-token"\n`
    );
    const config = await loadConfig(tmpDir, join(tmpDir, "..", "secrets.yaml"));
    expect(config.plugins["home-assistant"].token).toBe("my-secret-token");
  });

  it("throws if !secret references missing key", async () => {
    writeFileSync(
      join(tmpDir, "main.yaml"),
      `plugins:\n  ha:\n    token: !secret missing_key\n`
    );
    writeFileSync(join(tmpDir, "..", "secrets.yaml"), `other_key: "val"\n`);
    await expect(
      loadConfig(tmpDir, join(tmpDir, "..", "secrets.yaml"))
    ).rejects.toThrow(/missing_key/);
  });

  it("loads page configs from pages/ subdirectory", async () => {
    writeFileSync(join(tmpDir, "main.yaml"), `deck:\n  default_page: home\n`);
    mkdirSync(join(tmpDir, "pages"));
    writeFileSync(
      join(tmpDir, "pages", "home.yaml"),
      `page: home\nname: "Home"\nbuttons:\n  - pos: [0, 0]\n    label: "Test"\n`
    );
    const config = await loadConfig(tmpDir);
    expect(config.pages).toHaveLength(1);
    expect(config.pages[0].page).toBe("home");
    expect(config.pages[0].buttons[0].label).toBe("Test");
  });

  it("merges multiple YAML files in config root", async () => {
    writeFileSync(join(tmpDir, "main.yaml"), `deck:\n  brightness: 80\n`);
    writeFileSync(
      join(tmpDir, "devices.yaml"),
      `devices:\n  - id: macbook\n    platform: darwin\n`
    );
    const config = await loadConfig(tmpDir);
    expect(config.deck.brightness).toBe(80);
    expect(config.devices[0].id).toBe("macbook");
  });
});

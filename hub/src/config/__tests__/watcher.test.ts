// hub/src/config/__tests__/watcher.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigWatcher } from "../watcher.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("ConfigWatcher", () => {
  let tmpDir: string;
  let watcher: ConfigWatcher;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "omnideck-watcher-test-"));
  });

  afterEach(async () => {
    await watcher?.stop();
    rmSync(tmpDir, { recursive: true });
  });

  it("calls onChange callback when a .yaml file is added", async () => {
    watcher = new ConfigWatcher(tmpDir);
    const calls: string[] = [];
    watcher.onChange((filePath) => calls.push(filePath));
    await watcher.start();

    writeFileSync(join(tmpDir, "main.yaml"), "deck:\n  brightness: 80\n");
    await delay(300);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toMatch(/main\.yaml$/);
  });

  it("calls onChange callback when a .yaml file changes", async () => {
    // Pre-create the file so the initial add event fires before we register
    const filePath = join(tmpDir, "config.yaml");
    writeFileSync(filePath, "deck:\n  brightness: 50\n");

    watcher = new ConfigWatcher(tmpDir);
    const calls: string[] = [];
    watcher.onChange((p) => calls.push(p));
    await watcher.start();

    // Wait for initial scan to settle
    await delay(200);
    calls.length = 0; // reset after initial add event

    writeFileSync(filePath, "deck:\n  brightness: 99\n");
    await delay(300);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toMatch(/config\.yaml$/);
  });

  it("calls onChange callback when a .yml file is added", async () => {
    watcher = new ConfigWatcher(tmpDir);
    const calls: string[] = [];
    watcher.onChange((p) => calls.push(p));
    await watcher.start();

    writeFileSync(join(tmpDir, "devices.yml"), "devices: []\n");
    await delay(300);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toMatch(/devices\.yml$/);
  });

  it("ignores non-YAML files", async () => {
    watcher = new ConfigWatcher(tmpDir);
    const calls: string[] = [];
    watcher.onChange((p) => calls.push(p));
    await watcher.start();

    writeFileSync(join(tmpDir, "notes.txt"), "some text\n");
    writeFileSync(join(tmpDir, "script.js"), "console.log('hi');\n");
    await delay(300);

    expect(calls.length).toBe(0);
  });

  it("stop() stops watching and no more callbacks fire", async () => {
    watcher = new ConfigWatcher(tmpDir);
    const calls: string[] = [];
    watcher.onChange((p) => calls.push(p));
    await watcher.start();

    await watcher.stop();
    const countBefore = calls.length;

    writeFileSync(join(tmpDir, "late.yaml"), "late: true\n");
    await delay(300);

    expect(calls.length).toBe(countBefore);
  });
});

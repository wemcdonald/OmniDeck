import { describe, it, expect } from "bun:test";
import { execCommand } from "../exec.js";

describe("execCommand", () => {
  it("runs a simple command and returns stdout", async () => {
    const result = await execCommand("echo", ["hello"]);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exitCode).toBe(0);
  });

  it("returns stderr on error", async () => {
    const result = await execCommand("ls", ["/nonexistent-path-12345"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it("handles commands that don't exist", async () => {
    const result = await execCommand("this-command-does-not-exist-xyz", []);
    expect(result.exitCode).not.toBe(0);
  });
});

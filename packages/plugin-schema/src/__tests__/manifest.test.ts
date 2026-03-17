import { describe, it, expect } from "vitest";
import { PluginManifestSchema, PluginDistributionSchema } from "../manifest.js";

describe("PluginManifestSchema", () => {
  it("validates a hub-only plugin manifest", () => {
    const result = PluginManifestSchema.safeParse({
      id: "home-assistant",
      name: "Home Assistant",
      version: "1.0.0",
      hub: "hub.ts",
    });
    expect(result.success).toBe(true);
  });

  it("validates a hub+agent plugin manifest", () => {
    const result = PluginManifestSchema.safeParse({
      id: "bettertouchtool",
      name: "BetterTouchTool",
      version: "0.1.0",
      platforms: ["darwin"],
      hub: "hub.ts",
      agent: "agent.ts",
    });
    expect(result.success).toBe(true);
  });

  it("rejects manifest without id", () => {
    const result = PluginManifestSchema.safeParse({
      name: "Missing ID",
      version: "1.0.0",
      hub: "hub.ts",
    });
    expect(result.success).toBe(false);
  });

  it("defaults platforms to all when not specified", () => {
    const result = PluginManifestSchema.parse({
      id: "test",
      name: "Test",
      version: "1.0.0",
      hub: "hub.ts",
      agent: "agent.ts",
    });
    expect(result.platforms).toEqual(["darwin", "windows", "linux"]);
  });

  it("allows hub-only plugin with no agent field", () => {
    const result = PluginManifestSchema.parse({
      id: "spotify",
      name: "Spotify",
      version: "1.0.0",
      hub: "hub.ts",
    });
    expect(result.agent).toBeUndefined();
  });
});

describe("PluginDistributionSchema", () => {
  it("validates a plugin distribution entry", () => {
    const result = PluginDistributionSchema.safeParse({
      id: "btt",
      version: "0.1.0",
      sha256: "abc123def456",
      platforms: ["darwin"],
      hasAgent: true,
    });
    expect(result.success).toBe(true);
  });
});

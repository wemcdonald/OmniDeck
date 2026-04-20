import { describe, it, expect } from "vitest";
import { normalizeHubUrl, DEFAULT_HUB_PORT } from "../hubUrl";

describe("normalizeHubUrl", () => {
  it("returns empty for empty input", () => {
    expect(normalizeHubUrl("")).toBe("");
    expect(normalizeHubUrl("   ")).toBe("");
  });

  it("adds wss:// and default port to bare hostname", () => {
    expect(normalizeHubUrl("myhub")).toBe(`wss://myhub:${DEFAULT_HUB_PORT}`);
    expect(normalizeHubUrl("myhub.local")).toBe(`wss://myhub.local:${DEFAULT_HUB_PORT}`);
  });

  it("adds wss:// and default port to IP", () => {
    expect(normalizeHubUrl("192.168.1.5")).toBe(`wss://192.168.1.5:${DEFAULT_HUB_PORT}`);
  });

  it("preserves explicit port", () => {
    expect(normalizeHubUrl("myhub:9999")).toBe("wss://myhub:9999");
    expect(normalizeHubUrl("192.168.1.5:8443")).toBe("wss://192.168.1.5:8443");
  });

  it("strips http/https/ws and re-prefixes wss://", () => {
    expect(normalizeHubUrl("https://myhub.local")).toBe(`wss://myhub.local:${DEFAULT_HUB_PORT}`);
    expect(normalizeHubUrl("http://myhub:9999")).toBe("wss://myhub:9999");
    expect(normalizeHubUrl("ws://myhub.local:9210")).toBe("wss://myhub.local:9210");
  });

  it("is idempotent on already-normalized input", () => {
    const input = "wss://myhub.local:9210";
    expect(normalizeHubUrl(input)).toBe(input);
  });

  it("trims whitespace", () => {
    expect(normalizeHubUrl("  myhub.local  ")).toBe(`wss://myhub.local:${DEFAULT_HUB_PORT}`);
  });
});

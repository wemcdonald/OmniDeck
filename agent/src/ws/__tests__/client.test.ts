import { describe, it, expect } from "bun:test";
import { AgentClient } from "../client.js";
import { parseMessage, createMessage } from "../protocol.js";

describe("protocol helpers", () => {
  it("createMessage produces a well-formed WsMessage", () => {
    const msg = createMessage("ping", { foo: "bar" });
    expect(msg.v).toBe(1);
    expect(msg.type).toBe("ping");
    expect(msg.data).toEqual({ foo: "bar" });
    expect(typeof msg.ts).toBe("string");
    expect(msg.id).toBeUndefined();
  });

  it("createMessage includes optional id", () => {
    const msg = createMessage("ping", {}, "req-1");
    expect(msg.id).toBe("req-1");
  });

  it("parseMessage round-trips correctly", () => {
    const original = createMessage("state_update", { hostname: "box" }, "abc");
    const parsed = parseMessage(JSON.stringify(original));
    expect(parsed.v).toBe(1);
    expect(parsed.type).toBe("state_update");
    expect(parsed.id).toBe("abc");
    expect((parsed.data as Record<string, unknown>).hostname).toBe("box");
  });

  it("parseMessage throws on unsupported protocol version", () => {
    const bad = JSON.stringify({ v: 2, type: "ping", data: {}, ts: new Date().toISOString() });
    expect(() => parseMessage(bad)).toThrow("Unsupported protocol version: 2");
  });
});

describe("AgentClient", () => {
  it("constructs with hub URL and agent info", () => {
    const client = new AgentClient({
      hubUrl: "ws://localhost:9200",
      hostname: "test-mac",
      deviceName: "test-mac",
      platform: "darwin",
      agentVersion: "0.2.0",
    });
    expect(client).toBeDefined();
  });

  it("creates well-formed state_update hello message", () => {
    const client = new AgentClient({
      hubUrl: "ws://localhost:9200",
      hostname: "test-mac",
      deviceName: "test-mac",
      platform: "darwin",
      agentVersion: "0.2.0",
    });
    const msg = client.createHelloMessage();
    expect(msg.v).toBe(1);
    expect(msg.type).toBe("state_update");
    const data = msg.data as Record<string, unknown>;
    expect(data.hostname).toBe("test-mac");
    expect(data.platform).toBe("darwin");
    expect(data.agent_version).toBe("0.2.0");
  });

  it("hello message has a valid ISO timestamp", () => {
    const client = new AgentClient({
      hubUrl: "ws://localhost:9200",
      hostname: "box",
      deviceName: "box",
      platform: "linux",
      agentVersion: "0.1.0",
    });
    const msg = client.createHelloMessage();
    expect(() => new Date(msg.ts).toISOString()).not.toThrow();
  });

  it("registers message handlers via onMessage", () => {
    const client = new AgentClient({
      hubUrl: "ws://localhost:9200",
      hostname: "test-mac",
      deviceName: "test-mac",
      platform: "darwin",
      agentVersion: "0.2.0",
    });
    // Should not throw
    client.onMessage("command", (_msg) => {});
    client.onMessage("plugin_manifest", (_msg) => {});
    expect(true).toBe(true);
  });

  it("close() is safe to call before connect()", () => {
    const client = new AgentClient({
      hubUrl: "ws://localhost:9200",
      hostname: "test-mac",
      deviceName: "test-mac",
      platform: "darwin",
      agentVersion: "0.2.0",
    });
    // Should not throw
    expect(() => client.close()).not.toThrow();
  });
});

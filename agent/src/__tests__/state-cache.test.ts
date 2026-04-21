import { describe, it, expect } from "bun:test";
import { StateCache } from "../state-cache.js";

describe("StateCache", () => {
  it("stores and replays entries", () => {
    const cache = new StateCache();
    cache.set("discord", "state", { connected: true });
    cache.set("discord", "voice", { channel: "general" });
    cache.set("clock", "time", "12:00");

    const entries = Array.from(cache.entries());
    expect(entries).toHaveLength(3);
    expect(entries).toContainEqual(["discord", "state", { connected: true }]);
    expect(entries).toContainEqual(["discord", "voice", { channel: "general" }]);
    expect(entries).toContainEqual(["clock", "time", "12:00"]);
  });

  it("overwrites previous value for the same key", () => {
    const cache = new StateCache();
    cache.set("counter", "count", 1);
    cache.set("counter", "count", 2);

    const entries = Array.from(cache.entries());
    expect(entries).toEqual([["counter", "count", 2]]);
  });

  it("evicts only the named plugin on clearPlugin", () => {
    const cache = new StateCache();
    cache.set("discord", "state", "a");
    cache.set("clock", "time", "b");
    cache.clearPlugin("discord");

    const entries = Array.from(cache.entries());
    expect(entries).toEqual([["clock", "time", "b"]]);
  });

  it("reports its size", () => {
    const cache = new StateCache();
    expect(cache.size()).toBe(0);
    cache.set("a", "1", null);
    cache.set("a", "2", null);
    cache.set("b", "1", null);
    expect(cache.size()).toBe(3);
    cache.clearPlugin("a");
    expect(cache.size()).toBe(1);
    cache.clearAll();
    expect(cache.size()).toBe(0);
  });
});

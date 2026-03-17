// hub/src/state/__tests__/store.test.ts
import { describe, it, expect, vi } from "vitest";
import { StateStore } from "../store.js";

describe("StateStore", () => {
  it("stores and retrieves values by plugin namespace", () => {
    const store = new StateStore();
    store.set("spotify", "now_playing", { track: "Hello" });
    expect(store.get("spotify", "now_playing")).toEqual({ track: "Hello" });
  });

  it("returns undefined for missing keys", () => {
    const store = new StateStore();
    expect(store.get("spotify", "missing")).toBeUndefined();
  });

  it("returns all state for a plugin", () => {
    const store = new StateStore();
    store.set("ha", "light.office", { state: "on" });
    store.set("ha", "light.bedroom", { state: "off" });
    const all = store.getAll("ha");
    expect(all.size).toBe(2);
    expect(all.get("light.office")).toEqual({ state: "on" });
  });

  it("emits onChange for each set", () => {
    const store = new StateStore();
    const cb = vi.fn();
    store.onChange(cb);
    store.set("spotify", "track", "Hello");
    expect(cb).toHaveBeenCalledWith("spotify", "track", "Hello");
  });

  it("batches updates and fires onChange once per key at commit", () => {
    const store = new StateStore();
    const cb = vi.fn();
    store.onChange(cb);
    store.batch(() => {
      store.set("ha", "light.office", "on");
      store.set("ha", "light.bedroom", "off");
    });
    // cb should be called twice (once per key), but only after batch completes
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("does not fire onChange during batch", () => {
    const store = new StateStore();
    const calls: number[] = [];
    store.onChange(() => calls.push(Date.now()));
    store.batch(() => {
      store.set("ha", "a", 1);
      // At this point, onChange should NOT have been called yet
      expect(calls.length).toBe(0);
      store.set("ha", "b", 2);
    });
    expect(calls.length).toBe(2);
  });
});

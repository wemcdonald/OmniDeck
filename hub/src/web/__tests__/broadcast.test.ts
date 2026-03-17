import { describe, it, expect, vi, afterEach } from "vitest";
import { Broadcaster } from "../broadcast.js";

describe("Broadcaster", () => {
  let broadcaster: Broadcaster;

  afterEach(() => {
    broadcaster?.clear();
  });

  it("tracks connected clients", () => {
    broadcaster = new Broadcaster();
    const mockWs = { readyState: 1, send: vi.fn() } as any;
    broadcaster.add(mockWs);
    expect(broadcaster.size).toBe(1);
    broadcaster.remove(mockWs);
    expect(broadcaster.size).toBe(0);
  });

  it("sends JSON message to all open clients", () => {
    broadcaster = new Broadcaster();
    const mockWs1 = { readyState: 1, send: vi.fn() } as any;
    const mockWs2 = { readyState: 1, send: vi.fn() } as any;
    broadcaster.add(mockWs1);
    broadcaster.add(mockWs2);
    broadcaster.send({ type: "config:reloaded" });
    expect(mockWs1.send).toHaveBeenCalledWith(JSON.stringify({ type: "config:reloaded" }));
    expect(mockWs2.send).toHaveBeenCalledWith(JSON.stringify({ type: "config:reloaded" }));
  });

  it("skips closed clients and removes them", () => {
    broadcaster = new Broadcaster();
    const open = { readyState: 1, send: vi.fn() } as any;
    const closed = { readyState: 3, send: vi.fn() } as any;
    broadcaster.add(open);
    broadcaster.add(closed);
    broadcaster.send({ type: "config:reloaded" });
    expect(open.send).toHaveBeenCalled();
    expect(closed.send).not.toHaveBeenCalled();
    expect(broadcaster.size).toBe(1); // closed was pruned
  });

  it("clears all clients", () => {
    broadcaster = new Broadcaster();
    broadcaster.add({ readyState: 1, send: vi.fn() } as any);
    broadcaster.add({ readyState: 1, send: vi.fn() } as any);
    broadcaster.clear();
    expect(broadcaster.size).toBe(0);
  });
});

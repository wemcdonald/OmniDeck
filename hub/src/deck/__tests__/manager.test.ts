import { describe, it, expect, vi } from "vitest";
import { MockDeck } from "../mock.js";

describe("MockDeck", () => {
  it("tracks connection state", async () => {
    const deck = new MockDeck();
    expect(deck.connected).toBe(false);
    await deck.connect();
    expect(deck.connected).toBe(true);
    await deck.disconnect();
    expect(deck.connected).toBe(false);
  });

  it("fires onKeyDown callbacks", () => {
    const deck = new MockDeck();
    const cb = vi.fn();
    deck.onKeyDown(cb);
    deck.simulateKeyDown(5);
    expect(cb).toHaveBeenCalledWith(5);
  });

  it("fires onKeyUp callbacks", () => {
    const deck = new MockDeck();
    const cb = vi.fn();
    deck.onKeyUp(cb);
    deck.simulateKeyUp(3);
    expect(cb).toHaveBeenCalledWith(3);
  });

  it("stores images set on keys", async () => {
    const deck = new MockDeck();
    const buf = Buffer.from("test-image");
    await deck.setKeyImage(0, buf);
    expect(deck.images.get(0)).toBe(buf);
  });

  it("stores brightness", async () => {
    const deck = new MockDeck();
    await deck.setBrightness(50);
    expect(deck.brightness).toBe(50);
  });

  it("reports correct key count and layout", () => {
    const deck = new MockDeck({ keyCount: 32, columns: 8 });
    expect(deck.keyCount).toBe(32);
    expect(deck.keyColumns).toBe(8);
  });
});

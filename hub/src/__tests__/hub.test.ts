import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hub } from "../hub.js";
import { MockDeck } from "../deck/mock.js";

describe("Hub", () => {
  let hub: Hub;
  let deck: MockDeck;

  beforeEach(async () => {
    deck = new MockDeck({ keyCount: 15, columns: 5 });
    hub = new Hub({ deck, configDir: undefined });
  });

  it("initializes with a deck and page state", async () => {
    await hub.start([
      {
        page: "home",
        name: "Home",
        buttons: [
          { pos: [0, 0] as [number, number], label: "Test", background: "#ff0000" },
        ],
      },
    ]);
    expect(deck.connected).toBe(true);
  });

  it("renders buttons to the deck on start", async () => {
    await hub.start([
      {
        page: "home",
        name: "Home",
        buttons: [
          { pos: [0, 0] as [number, number], label: "Hello", background: "#0000ff" },
        ],
      },
    ]);
    // Key 0 should have an image
    expect(deck.images.has(0)).toBe(true);
  });

  it("handles key press by executing button action", async () => {
    const _actionSpy = vi.fn(async () => {});
    await hub.start([
      {
        page: "home",
        name: "Home",
        buttons: [
          {
            pos: [0, 0] as [number, number],
            label: "Nav",
            action: "omnideck-core.change_page",
            params: { page: "media" },
          },
        ],
      },
      {
        page: "media",
        name: "Media",
        buttons: [],
      },
    ]);
    // Simulate pressing key 0
    deck.simulateKeyDown(0);
    // After the action, current page should be "media"
    const currentPage = hub.getCurrentPage();
    expect(currentPage).toBe("media");
  });

  it("switches pages and re-renders", async () => {
    await hub.start([
      {
        page: "home",
        name: "Home",
        buttons: [
          {
            pos: [0, 0] as [number, number],
            label: "Go Media",
            action: "omnideck-core.change_page",
            params: { page: "media" },
          },
        ],
      },
      {
        page: "media",
        name: "Media",
        buttons: [
          { pos: [0, 0] as [number, number], label: "Now Playing", background: "#1db954" },
        ],
      },
    ]);

    const imagesBefore = new Map(deck.images);
    deck.simulateKeyDown(0); // navigate to media page

    // Give async rendering a tick
    await new Promise((r) => setTimeout(r, 50));
    // Images should have changed (media page rendered)
    expect(deck.images.get(0)).not.toEqual(imagesBefore.get(0));
  });
});

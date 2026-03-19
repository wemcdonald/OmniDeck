// hub/src/__tests__/integration.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { Hub } from "../hub.js";
import { MockDeck } from "../deck/mock.js";

describe("Hub Integration", () => {
  let hub: Hub;
  let deck: MockDeck;

  afterEach(async () => {
    await deck.disconnect();
  });

  it("full lifecycle: start → render → keypress → page nav → re-render", async () => {
    deck = new MockDeck({ keyCount: 15, columns: 5 });
    hub = new Hub({ deck, configDir: undefined, agentPort: 0 });

    // Start hub with two pages
    await hub.start([
      {
        page: "home",
        name: "Home",
        buttons: [
          {
            pos: [0, 0] as [number, number],
            label: "Media",
            action: "omnideck-core.change_page",
            params: { page: "media" },
          },
        ],
      },
      {
        page: "media",
        name: "Media",
        buttons: [
          {
            pos: [0, 0] as [number, number],
            label: "Back",
            action: "omnideck-core.go_back",
            params: {},
          },
        ],
      },
    ]);

    // Deck should be connected after start
    expect(deck.connected).toBe(true);

    // Key 0 (home page) should have an image rendered
    expect(deck.images.has(0)).toBe(true);

    // Initial page should be "home"
    expect(hub.getCurrentPage()).toBe("home");

    // Simulate key press on key 0 → navigate to media page
    deck.simulateKeyDown(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(hub.getCurrentPage()).toBe("media");

    // Key 0 on media page should now have a rendered image (re-render occurred)
    expect(deck.images.has(0)).toBe(true);

    // Simulate key press on key 0 on media → go_back to home
    deck.simulateKeyDown(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(hub.getCurrentPage()).toBe("home");
  });
});

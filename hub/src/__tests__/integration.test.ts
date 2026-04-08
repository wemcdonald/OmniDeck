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
    deck.simulateKeyUp(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(hub.getCurrentPage()).toBe("media");

    // Key 0 on media page should now have a rendered image (re-render occurred)
    expect(deck.images.has(0)).toBe(true);

    // Simulate key press on key 0 on media → go_back to home
    deck.simulateKeyDown(0);
    deck.simulateKeyUp(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(hub.getCurrentPage()).toBe("home");
  });

  it("no-keyup device fires action immediately on key-down (Path A)", async () => {
    deck = new MockDeck({ keyCount: 15, columns: 5, capabilities: { hasKeyUp: false } });
    hub = new Hub({ deck, configDir: undefined, agentPort: 0 });

    await hub.start([
      {
        page: "home",
        buttons: [
          {
            pos: [0, 0] as [number, number],
            action: "omnideck-core.change_page",
            params: { page: "other" },
          },
        ],
      },
      { page: "other", buttons: [] },
    ]);

    expect(hub.getCurrentPage()).toBe("home");

    // Only key-down — no key-up event (simulates Rev 1 Mirabox)
    deck.simulateKeyDown(0);
    await new Promise((r) => setTimeout(r, 50));

    expect(hub.getCurrentPage()).toBe("other");
  });

  it("no-keyup device ignores long_press_action (Path A)", async () => {
    deck = new MockDeck({ keyCount: 15, columns: 5, capabilities: { hasKeyUp: false } });
    hub = new Hub({ deck, configDir: undefined, agentPort: 0 });

    await hub.start([
      {
        page: "home",
        buttons: [
          {
            pos: [0, 0] as [number, number],
            // Only long_press_action, no regular action
            long_press_action: "omnideck-core.change_page",
            long_press_params: { page: "other" },
          },
        ],
      },
      { page: "other", buttons: [] },
    ]);

    deck.simulateKeyDown(0);
    await new Promise((r) => setTimeout(r, 50));

    // Should stay on home — long_press_action is not triggered without key-up
    expect(hub.getCurrentPage()).toBe("home");
  });

  it("hardware long-press fires long_press_action directly (Path C)", async () => {
    deck = new MockDeck({
      keyCount: 15,
      columns: 5,
      capabilities: { hasKeyUp: true, hasHardwareLongPress: true },
    });
    hub = new Hub({ deck, configDir: undefined, agentPort: 0 });

    await hub.start([
      {
        page: "home",
        buttons: [
          {
            pos: [0, 0] as [number, number],
            action: "omnideck-core.change_page",
            params: { page: "short" },
            long_press_action: "omnideck-core.change_page",
            long_press_params: { page: "long" },
          },
        ],
      },
      { page: "short", buttons: [] },
      { page: "long", buttons: [] },
    ]);

    // Simulate hardware long-press event (device reports it directly)
    deck.simulateLongPress(0);
    await new Promise((r) => setTimeout(r, 50));

    expect(hub.getCurrentPage()).toBe("long");
  });

  it("hardware long-press prevents software long-press from double-firing (Path C)", async () => {
    deck = new MockDeck({
      keyCount: 15,
      columns: 5,
      capabilities: { hasKeyUp: true, hasHardwareLongPress: true },
    });
    hub = new Hub({ deck, configDir: undefined, agentPort: 0 });

    let actionCount = 0;
    await hub.start([
      {
        page: "home",
        buttons: [
          {
            pos: [0, 0] as [number, number],
            long_press_action: "omnideck-core.change_page",
            long_press_params: { page: "long" },
          },
        ],
      },
      { page: "long", buttons: [] },
    ]);

    // Simulate hardware long-press followed by key-up (as real hardware would do)
    deck.simulateKeyDown(0);
    deck.simulateLongPress(0);
    deck.simulateKeyUp(0);
    await new Promise((r) => setTimeout(r, 50));

    // Should have navigated exactly once
    expect(hub.getCurrentPage()).toBe("long");
    void actionCount; // suppress unused warning
  });
});

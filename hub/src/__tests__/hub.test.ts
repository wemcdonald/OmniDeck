import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hub } from "../hub.js";
import { MockDeck } from "../deck/mock.js";

describe("Hub", () => {
  let hub: Hub;
  let deck: MockDeck;

  beforeEach(async () => {
    deck = new MockDeck({ keyCount: 15, columns: 5 });
    hub = new Hub({ deck, configDir: undefined, agentPort: 0 });
  });

  afterEach(async () => {
    await hub.stop();
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
    // Simulate pressing key 0 (down + up = short press)
    deck.simulateKeyDown(0);
    deck.simulateKeyUp(0);
    await new Promise((r) => setTimeout(r, 50));
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
    deck.simulateKeyDown(0);
    deck.simulateKeyUp(0); // navigate to media page

    // Give async rendering time to complete (sharp can be slow on ARM)
    await new Promise((r) => setTimeout(r, 500));
    // Images should have changed (media page rendered)
    expect(deck.images.get(0)).not.toEqual(imagesBefore.get(0));
  });

  it("disables agent-backed buttons when target agent is offline", async () => {
    await hub.start([
      {
        page: "home",
        name: "Home",
        buttons: [
          {
            pos: [0, 0] as [number, number],
            action: "sound.mute",
            target: "macbook",
            label: "Mute",
          },
        ],
      },
    ]);

    const internals = hub as unknown as {
      connectedAgents: Set<string>;
      store: { get: (p: string, k: string) => unknown; set: (p: string, k: string, v: unknown) => void };
    };

    // Pressing while macbook is offline should NOT set the pending dispatch key.
    deck.simulateKeyDown(0);
    deck.simulateKeyUp(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(internals.store.get("sound", "pending:macbook:mute")).toBeUndefined();

    // Simulate macbook connecting. The same field AgentServer mutates is
    // referenced, so adding here mimics the onAgentConnection handler path.
    internals.connectedAgents.add("macbook");
    internals.store.set("orchestrator", "connected_agents", ["macbook"]);

    deck.simulateKeyDown(0);
    deck.simulateKeyUp(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(internals.store.get("sound", "pending:macbook:mute")).toBeDefined();
  });

  it("dims disabled buttons by re-rendering on agent disconnect", async () => {
    await hub.start([
      {
        page: "home",
        name: "Home",
        buttons: [
          {
            pos: [0, 0] as [number, number],
            action: "sound.mute",
            target: "macbook",
            label: "Mute",
            icon: "ms:volume-off",
          },
        ],
      },
    ]);

    const internals = hub as unknown as {
      connectedAgents: Set<string>;
      store: { set: (p: string, k: string, v: unknown) => void };
      resolveButtonState: (b: unknown) => { opacity?: number };
    };

    const button = { pos: [0, 0] as [number, number], action: "sound.mute", target: "macbook", label: "Mute", icon: "ms:volume-off" };

    // Offline → opacity 0.2
    const offlineState = internals.resolveButtonState(button);
    expect(offlineState.opacity).toBe(0.2);

    // Online → opacity undefined (no dim applied)
    internals.connectedAgents.add("macbook");
    internals.store.set("orchestrator", "connected_agents", ["macbook"]);
    const onlineState = internals.resolveButtonState(button);
    expect(onlineState.opacity).toBeUndefined();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { HaStatePublisher } from "../publisher.js";
import { StateStore } from "../../../../state/store.js";

// Minimal mock of HaClient
function mockClient() {
  return {
    connected: true,
    fireEvent: vi.fn(async () => {}),
    callService: vi.fn(async () => {}),
  };
}

function mockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as any;
}

describe("HaStatePublisher — active_mode", () => {
  let store: StateStore;
  let client: ReturnType<typeof mockClient>;
  let log: ReturnType<typeof mockLogger>;

  beforeEach(() => {
    store = new StateStore();
    client = mockClient();
    log = mockLogger();
  });

  it("includes active_mode in events when enabled", async () => {
    store.set("omnideck-core", "active_mode", "gaming");

    const publisher = new HaStatePublisher(
      { enabled: true, method: "events", active_mode: true },
      store,
      client as any,
      log,
    );

    // Access private publish method via prototype
    await (publisher as any).publish();

    expect(client.fireEvent).toHaveBeenCalledWith(
      "omnideck_state",
      expect.objectContaining({ active_mode: "gaming" }),
    );
  });

  it("publishes 'none' when no mode is active", async () => {
    const publisher = new HaStatePublisher(
      { enabled: true, method: "events", active_mode: true },
      store,
      client as any,
      log,
    );

    await (publisher as any).publish();

    expect(client.fireEvent).toHaveBeenCalledWith(
      "omnideck_state",
      expect.objectContaining({ active_mode: "none" }),
    );
  });

  it("does not include active_mode when disabled", async () => {
    store.set("omnideck-core", "active_mode", "gaming");

    const publisher = new HaStatePublisher(
      { enabled: true, method: "events", active_mode: false },
      store,
      client as any,
      log,
    );

    await (publisher as any).publish();

    const call = client.fireEvent.mock.calls[0] as unknown[];
    const eventData = call?.[1] as Record<string, unknown> | undefined;
    expect(eventData?.active_mode).toBeUndefined();
  });

  it("publishes active_mode via input_helpers", async () => {
    store.set("omnideck-core", "active_mode", "working");

    const publisher = new HaStatePublisher(
      {
        enabled: true,
        method: "input_helpers",
        active_mode: true,
        entity_prefix: "omnideck",
      },
      store,
      client as any,
      log,
    );

    await (publisher as any).publish();

    expect(client.callService).toHaveBeenCalledWith(
      "input_text",
      "set_value",
      { value: "working" },
      { entity_id: "input_text.omnideck_active_mode" },
    );
  });

  it("triggers immediate publish on mode change when started", () => {
    const publisher = new HaStatePublisher(
      { enabled: true, method: "events", active_mode: true },
      store,
      client as any,
      log,
    );

    publisher.start();

    // Change mode — should trigger immediate publish
    store.set("omnideck-core", "active_mode", "gaming");

    // The publish is async, so fireEvent should have been called
    expect(client.fireEvent).toHaveBeenCalled();

    publisher.stop();
  });
});

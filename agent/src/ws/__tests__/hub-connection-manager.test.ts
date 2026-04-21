import { describe, it, expect, beforeEach } from "bun:test";
import { HubConnectionManager } from "../hub-connection-manager.js";
import type { HubConnection } from "../hub-connection.js";
import type { WsMessage } from "../protocol.js";

/** Fake HubConnection for tests — doesn't touch real WebSockets. */
class FakeHubConnection {
  sent: WsMessage[] = [];
  private _connected = false;
  constructor(public agentId: string) {}
  send(msg: WsMessage): void {
    this.sent.push(msg);
  }
  sendResponse(type: string, data: unknown, id?: string): void {
    this.sent.push({ id: id ?? "x", type, data } as WsMessage);
  }
  close(): void {
    this._connected = false;
  }
  isConnected(): boolean {
    return this._connected;
  }
  markConnected(): void {
    this._connected = true;
  }
  get credentials() {
    return { agent_id: this.agentId, token: "t", hub_address: "x", hub_name: this.agentId };
  }
  get client() {
    return { onMessage: () => {} };
  }
}

function inject(manager: HubConnectionManager, conn: FakeHubConnection): void {
  // Reach into the manager to register a synthetic connection without the
  // real addHub pipeline (which would try to dial a WebSocket).
  (manager as unknown as { hubs: Map<string, HubConnection> }).hubs.set(
    conn.agentId,
    conn as unknown as HubConnection,
  );
}

describe("HubConnectionManager", () => {
  let manager: HubConnectionManager;
  let home: FakeHubConnection;
  let work: FakeHubConnection;

  beforeEach(() => {
    manager = new HubConnectionManager();
    home = new FakeHubConnection("home");
    work = new FakeHubConnection("work");
    inject(manager, home);
    inject(manager, work);
  });

  it("broadcast only reaches connected hubs", () => {
    home.markConnected();
    // work stays disconnected
    manager.broadcast({ id: "m", type: "ping", data: {} } as WsMessage);
    expect(home.sent).toHaveLength(1);
    expect(work.sent).toHaveLength(0);
  });

  it("broadcast fans out to all connected hubs", () => {
    home.markConnected();
    work.markConnected();
    manager.broadcast({ id: "m", type: "ping", data: {} } as WsMessage);
    expect(home.sent).toHaveLength(1);
    expect(work.sent).toHaveLength(1);
  });

  it("removeHub closes and drops the connection", async () => {
    await manager.removeHub("home");
    expect(manager.get("home")).toBeUndefined();
    expect(manager.size()).toBe(1);
  });

  it("connected() filters by connection state", () => {
    work.markConnected();
    const live = manager.connected();
    expect(live).toHaveLength(1);
    expect(live[0].agentId).toBe("work");
  });

  it("closeAll drops every hub", () => {
    manager.closeAll();
    expect(manager.size()).toBe(0);
  });
});

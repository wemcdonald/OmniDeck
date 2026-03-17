import { describe, it, expect, vi, beforeEach } from "vitest";
import { PresenceManager } from "../presence.js";

describe("PresenceManager", () => {
  let presence: PresenceManager;

  beforeEach(() => {
    presence = new PresenceManager();
  });

  it("marks device as online on connect", () => {
    presence.deviceConnected("mac");
    expect(presence.isOnline("mac")).toBe(true);
  });

  it("marks device as offline on disconnect", () => {
    presence.deviceConnected("mac");
    presence.deviceDisconnected("mac");
    expect(presence.isOnline("mac")).toBe(false);
  });

  it("fires onStatusChange callback", () => {
    const cb = vi.fn();
    presence.onStatusChange(cb);
    presence.deviceConnected("mac");
    expect(cb).toHaveBeenCalledWith("mac", true);
    presence.deviceDisconnected("mac");
    expect(cb).toHaveBeenCalledWith("mac", false);
  });

  it("returns opacity 0.5 for offline devices", () => {
    presence.deviceConnected("mac");
    presence.deviceDisconnected("mac");
    expect(presence.getOpacity("mac")).toBe(0.5);
  });

  it("returns opacity 1.0 for online devices", () => {
    presence.deviceConnected("mac");
    expect(presence.getOpacity("mac")).toBe(1.0);
  });
});

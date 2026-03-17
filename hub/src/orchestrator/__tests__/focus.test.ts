import { describe, it, expect, vi, beforeEach } from "vitest";
import { FocusTracker } from "../focus.js";

describe("FocusTracker", () => {
  let tracker: FocusTracker;

  beforeEach(() => {
    tracker = new FocusTracker({ strategy: "idle_time", idle_threshold_ms: 30000 });
  });

  it("starts with no focused device", () => {
    expect(tracker.focused).toBeNull();
  });

  it("focuses device with shortest idle time", () => {
    tracker.updateDevice("mac", { online: true, idleTimeMs: 1000 });
    tracker.updateDevice("windows", { online: true, idleTimeMs: 5000 });
    expect(tracker.focused).toBe("mac");
  });

  it("unfocuses device after idle threshold", () => {
    tracker.updateDevice("mac", { online: true, idleTimeMs: 31000 });
    expect(tracker.focused).toBeNull();
  });

  it("fires onFocusChange when focus changes", () => {
    const cb = vi.fn();
    tracker.onFocusChange(cb);
    tracker.updateDevice("mac", { online: true, idleTimeMs: 1000 });
    expect(cb).toHaveBeenCalledWith(null, "mac");

    tracker.updateDevice("windows", { online: true, idleTimeMs: 500 });
    expect(cb).toHaveBeenCalledWith("mac", "windows");
  });

  it("handles device going offline", () => {
    tracker.updateDevice("mac", { online: true, idleTimeMs: 1000 });
    expect(tracker.focused).toBe("mac");

    tracker.updateDevice("mac", { online: false, idleTimeMs: 0 });
    expect(tracker.focused).toBeNull();
  });

  it("returns all device states", () => {
    tracker.updateDevice("mac", { online: true, idleTimeMs: 1000 });
    tracker.updateDevice("windows", { online: true, idleTimeMs: 5000 });
    expect(tracker.devices.size).toBe(2);
  });
});

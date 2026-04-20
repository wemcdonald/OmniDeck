import { describe, it, expect } from "vitest";
import { parseDuration, formatDuration } from "../duration.js";

describe("parseDuration", () => {
  it("parses simple tokens to target unit", () => {
    expect(parseDuration("5s", "ms")).toBe(5000);
    expect(parseDuration("24h", "ms")).toBe(86_400_000);
    expect(parseDuration("30m", "s")).toBe(1800);
    expect(parseDuration("90m", "h")).toBe(1.5);
  });

  it("treats a bare number as already-in-unit", () => {
    expect(parseDuration("5000", "ms")).toBe(5000);
    expect(parseDuration("60", "m")).toBe(60);
  });

  it("handles compound forms", () => {
    expect(parseDuration("1h 30m", "m")).toBe(90);
    expect(parseDuration("2m30s", "s")).toBe(150);
    expect(parseDuration("1h30m15s", "s")).toBe(5415);
  });

  it("accepts long-form unit names", () => {
    expect(parseDuration("5 seconds", "ms")).toBe(5000);
    expect(parseDuration("2 hours", "m")).toBe(120);
    expect(parseDuration("500 milliseconds", "ms")).toBe(500);
  });

  it("is case-insensitive", () => {
    expect(parseDuration("5S", "ms")).toBe(5000);
    expect(parseDuration("2H", "m")).toBe(120);
  });

  it("rejects garbage", () => {
    expect(parseDuration("", "ms")).toBeNull();
    expect(parseDuration("forever", "ms")).toBeNull();
    expect(parseDuration("5x", "ms")).toBeNull();
    expect(parseDuration("abc5s", "ms")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("picks the coarsest exact unit", () => {
    expect(formatDuration(5000, "ms")).toBe("5s");
    expect(formatDuration(86_400_000, "ms")).toBe("24h");
    expect(formatDuration(60_000, "ms")).toBe("1m");
    expect(formatDuration(1500, "ms")).toBe("1s 500ms");
    expect(formatDuration(500, "ms")).toBe("500ms");
  });

  it("round-trips with parseDuration", () => {
    for (const unit of ["ms", "s", "m", "h"] as const) {
      for (const v of [1, 5, 60, 3600, 86400, 1500, 90]) {
        const formatted = formatDuration(v, unit);
        const parsed = parseDuration(formatted, unit);
        expect(parsed).toBe(v);
      }
    }
  });

  it("emits compound for irregular values", () => {
    // 1h 30m 15s = 5415000 ms — not divisible by any single unit cleanly
    expect(formatDuration(5_415_000, "ms")).toBe("1h 30m 15s");
  });

  it("handles zero", () => {
    expect(formatDuration(0, "ms")).toBe("0ms");
    expect(formatDuration(0, "s")).toBe("0s");
  });
});

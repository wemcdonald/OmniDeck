import { describe, it, expect } from "vitest";
import { miraboxToStandard, standardToMirabox } from "../keymap.js";

describe("miraboxToStandard", () => {
  it("maps top-right key (1) to standard col 4, row 0", () => {
    expect(miraboxToStandard(1)).toBe(4);
  });

  it("maps top-left key (5) to standard col 0, row 0", () => {
    expect(miraboxToStandard(5)).toBe(0);
  });

  it("maps second-row rightmost key (6) to standard index 9", () => {
    expect(miraboxToStandard(6)).toBe(9);
  });

  it("maps second-row leftmost key (10) to standard index 5", () => {
    expect(miraboxToStandard(10)).toBe(5);
  });

  it("maps bottom-right key (11) to standard index 14", () => {
    expect(miraboxToStandard(11)).toBe(14);
  });

  it("maps bottom-left key (15) to standard index 10", () => {
    expect(miraboxToStandard(15)).toBe(10);
  });

  it("maps all 15 keys to unique indices in [0, 14]", () => {
    const results = new Set<number>();
    for (let k = 1; k <= 15; k++) {
      const s = miraboxToStandard(k);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(14);
      results.add(s);
    }
    expect(results.size).toBe(15);
  });

  it("throws on out-of-range key", () => {
    expect(() => miraboxToStandard(0)).toThrow(RangeError);
    expect(() => miraboxToStandard(16)).toThrow(RangeError);
  });
});

describe("standardToMirabox", () => {
  it("maps standard 4 (top-right) to mirabox key 1", () => {
    expect(standardToMirabox(4)).toBe(1);
  });

  it("maps standard 0 (top-left) to mirabox key 5", () => {
    expect(standardToMirabox(0)).toBe(5);
  });

  it("throws on out-of-range index", () => {
    expect(() => standardToMirabox(-1)).toThrow(RangeError);
    expect(() => standardToMirabox(15)).toThrow(RangeError);
  });
});

describe("round-trip", () => {
  it("miraboxToStandard(standardToMirabox(n)) === n for all valid keys", () => {
    for (let std = 0; std <= 14; std++) {
      expect(miraboxToStandard(standardToMirabox(std))).toBe(std);
    }
  });

  it("standardToMirabox(miraboxToStandard(n)) === n for all valid keys", () => {
    for (let mb = 1; mb <= 15; mb++) {
      expect(standardToMirabox(miraboxToStandard(mb))).toBe(mb);
    }
  });
});

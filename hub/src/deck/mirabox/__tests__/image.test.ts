import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { encodeKeyImage } from "../image.js";

describe("encodeKeyImage", () => {
  function makeRgb(width: number, height: number): Buffer {
    // Solid red image
    const buf = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      buf[i * 3] = 255; // R
      buf[i * 3 + 1] = 0; // G
      buf[i * 3 + 2] = 0; // B
    }
    return buf;
  }

  it("produces a non-empty buffer", async () => {
    const rgb = makeRgb(96, 96);
    const jpeg = await encodeKeyImage(rgb, { width: 96, height: 96 }, 85);
    expect(jpeg.length).toBeGreaterThan(0);
  });

  it("output is valid JPEG (starts with FFD8 magic bytes)", async () => {
    const rgb = makeRgb(96, 96);
    const jpeg = await encodeKeyImage(rgb, { width: 96, height: 96 }, 85);
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
  });

  it("output dimensions match targetSize for 85px", async () => {
    const rgb = makeRgb(96, 96);
    const jpeg = await encodeKeyImage(rgb, { width: 96, height: 96 }, 85);
    const meta = await sharp(jpeg).metadata();
    expect(meta.width).toBe(85);
    expect(meta.height).toBe(85);
  });

  it("output dimensions match targetSize for 95px", async () => {
    const rgb = makeRgb(96, 96);
    const jpeg = await encodeKeyImage(rgb, { width: 96, height: 96 }, 95);
    const meta = await sharp(jpeg).metadata();
    expect(meta.width).toBe(95);
    expect(meta.height).toBe(95);
  });

  it("handles non-square source images", async () => {
    const rgb = makeRgb(100, 80);
    const jpeg = await encodeKeyImage(rgb, { width: 100, height: 80 }, 85);
    const meta = await sharp(jpeg).metadata();
    expect(meta.width).toBe(85);
    expect(meta.height).toBe(85);
  });
});

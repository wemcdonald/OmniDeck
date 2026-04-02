import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { ButtonRenderer } from "../renderer.js";

describe("ButtonRenderer", () => {
  const size = { width: 96, height: 96 };
  // Raw RGB buffer: 96 * 96 * 3 bytes (no alpha)
  const expectedBytes = 96 * 96 * 3;

  it("renders a solid color background", async () => {
    const renderer = new ButtonRenderer(size);
    const buf = await renderer.render({ background: "#ff0000" });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(expectedBytes);
  });

  it("renders a label on the button", async () => {
    const renderer = new ButtonRenderer(size);
    const buf = await renderer.render({
      background: "#000000",
      label: "Test",
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(expectedBytes);
  });

  it("renders with default black background when none specified", async () => {
    const renderer = new ButtonRenderer(size);
    const buf = await renderer.render({});
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(expectedBytes);
  });

  it("applies opacity overlay", async () => {
    const renderer = new ButtonRenderer(size);
    const buf = await renderer.render({
      background: "#00ff00",
      opacity: 0.5,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(expectedBytes);
  });

  it("renders a Buffer icon (no opacity)", async () => {
    const renderer = new ButtonRenderer(size);
    const whiteJpeg = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 255, g: 255, b: 255 } },
    }).jpeg().toBuffer();

    const buf = await renderer.render({
      background: "#000000",
      icon: whiteJpeg,
      iconFullBleed: true,
    });
    expect(buf.length).toBe(expectedBytes);
    const centerOffset = (48 * 96 + 48) * 3;
    // White icon on black bg, full bleed — center should be white
    expect(buf[centerOffset]).toBeGreaterThan(200);
  });

  it("applies opacity overlay to a Buffer icon without producing black", async () => {
    const renderer = new ButtonRenderer(size);

    // Create a bright white JPEG image as the icon (like album art)
    const whiteJpeg = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .jpeg()
      .toBuffer();

    const buf = await renderer.render({
      background: "#000000",
      icon: whiteJpeg,
      iconFullBleed: true,
      opacity: 0.7,
    });

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(expectedBytes);

    // The rendered image should NOT be all black. With a white icon and opacity 0.7,
    // the center pixels should be around 0.7 * 255 ≈ 178 (dimmed white, not black).
    // Sample the center pixel (RGB at offset for pixel [48, 48] in a 96-wide image).
    const centerOffset = (48 * 96 + 48) * 3;
    const r = buf[centerOffset];
    const g = buf[centerOffset + 1];
    const b = buf[centerOffset + 2];
    // Should be bright-ish (dimmed white), not black
    expect(r).toBeGreaterThan(100);
    expect(g).toBeGreaterThan(100);
    expect(b).toBeGreaterThan(100);
  });

  it("renders a progress bar", async () => {
    const renderer = new ButtonRenderer(size);
    const buf = await renderer.render({
      background: "#000000",
      progress: 0.5,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(expectedBytes);
  });

  it("renders a badge", async () => {
    const renderer = new ButtonRenderer(size);
    const buf = await renderer.render({
      background: "#000000",
      badge: 5,
      badgeColor: "#ff0000",
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(expectedBytes);
  });
});

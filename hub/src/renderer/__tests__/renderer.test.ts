import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { ButtonRenderer } from "../renderer.js";

describe("ButtonRenderer", () => {
  const size = { width: 96, height: 96 };

  it("renders a solid color background", async () => {
    const renderer = new ButtonRenderer(size);
    const buf = await renderer.render({ background: "#ff0000" });
    expect(buf).toBeInstanceOf(Buffer);
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(96);
    expect(meta.height).toBe(96);
    expect(meta.format).toBe("jpeg");
  });

  it("renders a label on the button", async () => {
    const renderer = new ButtonRenderer(size);
    const buf = await renderer.render({
      background: "#000000",
      label: "Test",
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(96);
    expect(meta.height).toBe(96);
  });

  it("renders with default black background when none specified", async () => {
    const renderer = new ButtonRenderer(size);
    const buf = await renderer.render({});
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("applies opacity overlay", async () => {
    const renderer = new ButtonRenderer(size);
    const buf = await renderer.render({
      background: "#00ff00",
      opacity: 0.5,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(96);
  });

  it("renders a progress bar", async () => {
    const renderer = new ButtonRenderer(size);
    const buf = await renderer.render({
      background: "#000000",
      progress: 0.5,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("renders a badge", async () => {
    const renderer = new ButtonRenderer(size);
    const buf = await renderer.render({
      background: "#000000",
      badge: 5,
      badgeColor: "#ff0000",
    });
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe("jpeg");
  });
});

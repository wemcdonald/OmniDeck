import { describe, it, expect } from "vitest";
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

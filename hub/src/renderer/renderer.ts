import sharp from "sharp";
import type { ButtonState } from "./types.js";

interface Size {
  width: number;
  height: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createSvgText(
  text: string,
  width: number,
  height: number,
  position: "top" | "bottom"
): Buffer {
  const y = position === "bottom" ? height - 8 : 16;
  const fontSize = Math.max(10, Math.min(14, Math.floor(width / (text.length * 0.7))));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <text x="${width / 2}" y="${y}"
      font-family="sans-serif" font-size="${fontSize}" font-weight="bold"
      fill="white" text-anchor="middle">
      ${escapeXml(text)}
    </text>
  </svg>`;
  return Buffer.from(svg);
}

function createBadge(
  width: number,
  height: number,
  badge: string | number,
  color: string
): Buffer {
  const { r, g, b } = hexToRgb(color);
  const text = String(badge);
  const badgeSize = 20;
  const x = width - badgeSize - 2;
  const y = 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect x="${x}" y="${y}" width="${badgeSize}" height="${badgeSize}" rx="${badgeSize / 2}"
      fill="rgb(${r},${g},${b})" />
    <text x="${x + badgeSize / 2}" y="${y + badgeSize / 2 + 4}"
      font-family="sans-serif" font-size="11" font-weight="bold"
      fill="white" text-anchor="middle">
      ${escapeXml(text)}
    </text>
  </svg>`;
  return Buffer.from(svg);
}

function createProgressBar(width: number, height: number, progress: number): Buffer {
  const barHeight = 6;
  const barY = height - barHeight;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const barWidth = Math.round(width * clampedProgress);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect x="0" y="${barY}" width="${barWidth}" height="${barHeight}"
      fill="#00aaff" />
  </svg>`;
  return Buffer.from(svg);
}

export class ButtonRenderer {
  private size: Size;

  constructor(size: Size) {
    this.size = size;
  }

  async render(state: ButtonState): Promise<Buffer> {
    const { width, height } = this.size;

    // Layer 1: Background
    let bg: Buffer;
    if (typeof state.background === "string") {
      const { r, g, b } = hexToRgb(state.background);
      bg = await sharp({
        create: { width, height, channels: 3, background: { r, g, b } },
      })
        .jpeg()
        .toBuffer();
    } else if (Buffer.isBuffer(state.background)) {
      bg = await sharp(state.background).resize(width, height).jpeg().toBuffer();
    } else {
      bg = await sharp({
        create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .jpeg()
        .toBuffer();
    }

    const overlays: sharp.OverlayOptions[] = [];

    // Layer 2: Icon (if Buffer)
    if (Buffer.isBuffer(state.icon)) {
      const iconPadding = Math.round(width * 0.15);
      const iconSize = width - iconPadding * 2;
      const resizedIcon = await sharp(state.icon)
        .resize(iconSize, iconSize, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      overlays.push({ input: resizedIcon, gravity: "centre" });
    }

    // Layer 3: Label text (bottom)
    if (state.label) {
      overlays.push({ input: createSvgText(state.label, width, height, "bottom") });
    }

    // Layer 4: Top label text
    if (state.topLabel) {
      overlays.push({ input: createSvgText(state.topLabel, width, height, "top") });
    }

    // Layer 5: Badge
    if (state.badge !== undefined) {
      overlays.push({
        input: createBadge(width, height, state.badge, state.badgeColor ?? "#ff0000"),
      });
    }

    // Layer 6: Progress bar
    if (state.progress !== undefined) {
      overlays.push({ input: createProgressBar(width, height, state.progress) });
    }

    let result = sharp(bg);
    if (overlays.length > 0) {
      result = result.composite(overlays);
    }

    // Layer 7: Opacity overlay (darkening)
    if (state.opacity !== undefined && state.opacity < 1) {
      const alpha = Math.round((1 - state.opacity) * 255);
      const dimOverlay = await sharp({
        create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha } },
      })
        .png()
        .toBuffer();
      result = sharp(await result.jpeg().toBuffer()).composite([{ input: dimOverlay }]);
    }

    return result.jpeg({ quality: 90 }).toBuffer();
  }
}

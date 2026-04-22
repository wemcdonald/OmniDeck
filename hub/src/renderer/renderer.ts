import sharp from "sharp";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { getIconData, iconToSVG } from "@iconify/utils";
import type { ButtonState } from "./types.js";
import { getPluginIcon, parsePluginIconRef } from "../plugins/icons.js";

const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const materialSymbolsData = _require("@iconify-json/material-symbols/icons.json") as Parameters<typeof getIconData>[0];

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve assets dir relative to this file for both tsx (src/) and built (dist/) layouts
{
  let registered = false;
  for (const rel of ["../../assets", "../assets"]) {
    const candidate = join(__dirname, rel, "NotoColorEmoji.ttf");
    try {
      const result = GlobalFonts.registerFromPath(candidate, "NotoColorEmoji");
      if (result) { registered = true; break; }
    } catch {
      // try next candidate
    }
  }
  if (!registered) {
    console.warn("[renderer] NotoColorEmoji font not loaded — emoji icons will not render. Run 'git lfs pull' to fetch the font file.");
  }
}

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
  position: "top" | "bottom",
  color = "#ffffff"
): Buffer {
  const y = position === "bottom" ? height - 8 : 16;
  const fontSize = Math.max(10, Math.min(14, Math.floor(width / (text.length * 0.7))));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <text x="${width / 2}" y="${y}"
      font-family="sans-serif" font-size="${fontSize}" font-weight="bold"
      fill="${escapeXml(color)}" text-anchor="middle">
      ${escapeXml(text)}
    </text>
  </svg>`;
  return Buffer.from(svg);
}

function createScrollingSvgText(
  text: string,
  width: number,
  height: number,
  position: "top" | "bottom",
  scrollTick: number,
  color = "#ffffff",
): Buffer {
  const fontSize = position === "bottom" ? 12 : 11;
  const charWidth = fontSize * 0.55;
  const textWidth = text.length * charWidth;
  const usableWidth = width - 4;

  // If text fits, render normally (centered, no scroll)
  if (textWidth <= usableWidth) {
    return createSvgText(text, width, height, position, color);
  }

  const gapWidth = charWidth * 6;
  const totalWidth = textWidth + gapWidth;
  const pixelsPerTick = 5;
  const offset = (scrollTick * pixelsPerTick) % totalWidth;

  const y = position === "bottom" ? height - 8 : 16;
  const clipY = y - fontSize;
  const clipId = `sc${position[0]}`;
  const doubled = text + "\u2003\u2003\u2003" + text; // em-spaces as gap

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <clipPath id="${clipId}">
        <rect x="2" y="${clipY}" width="${usableWidth}" height="${fontSize + 6}"/>
      </clipPath>
    </defs>
    <text x="${2 - offset}" y="${y}"
      font-family="sans-serif" font-size="${fontSize}" font-weight="bold"
      fill="${escapeXml(color)}" clip-path="url(#${clipId})">
      ${escapeXml(doubled)}
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

// ── Body-label rendering ────────────────────────────────────────────────────
// Large centered text that fills the tile body. Wraps at natural separators
// and auto-sizes to fit. Used for tiles where the text IS the content.

const BODY_SEPARATORS = ["-", "_", ".", "/", " "];

function wrapBodyText(text: string): string[] {
  if (text.length <= 8) return [text];
  let best: [string, string] | undefined;
  let bestDelta = Infinity;
  for (let i = 1; i < text.length - 1; i++) {
    if (!BODY_SEPARATORS.includes(text[i]!)) continue;
    const left = text.slice(0, i);
    const right = text.slice(i + 1);
    const delta = Math.abs(left.length - right.length);
    if (delta < bestDelta) {
      best = [left, right];
      bestDelta = delta;
    }
  }
  if (best && Math.max(best[0].length, best[1].length) <= 12) return best;
  const mid = Math.ceil(text.length / 2);
  return [text.slice(0, mid), text.slice(mid)];
}

function createBodyLabelBuffer(
  text: string,
  width: number,
  height: number,
  color: string,
): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = wrapBodyText(text);
  const maxWidth = width - Math.round(width * 0.12);
  const maxFont = Math.round(width * 0.35);
  const minFont = Math.max(10, Math.round(width * 0.12));
  let fontSize = minFont;
  for (let size = maxFont; size >= minFont; size -= 2) {
    ctx.font = `bold ${size}px sans-serif`;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest <= maxWidth) {
      fontSize = size;
      break;
    }
  }

  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = color;
  const lineHeight = Math.round(fontSize * 1.1);
  const totalHeight = lineHeight * lines.length;
  // Center vertically in the area below the corner-icon reservation (~22% top).
  const topReserved = Math.round(height * 0.22);
  const centerY = topReserved + (height - topReserved) / 2;
  const firstY = centerY - totalHeight / 2 + lineHeight / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, width / 2, firstY + i * lineHeight);
  }
  return canvas.toBuffer("image/png");
}

/** Resolve any icon value (Buffer, `ms:*`, emoji/text) to a square PNG buffer. */
async function resolveIconBuffer(
  icon: string | Buffer | undefined,
  size: number,
  fillColor?: string,
): Promise<Buffer | undefined> {
  if (!icon || size <= 0) return undefined;
  if (Buffer.isBuffer(icon)) {
    return sharp(icon)
      .resize(size, size, { fit: "cover", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }
  if (typeof icon !== "string" || icon.length === 0) return undefined;
  const pluginRef = parsePluginIconRef(icon);
  if (pluginRef) {
    const asset = getPluginIcon(pluginRef.pluginId, pluginRef.name);
    if (!asset) return undefined;
    let input: Buffer;
    if (asset.svg) {
      // Tint via currentColor substitution when a fillColor is supplied.
      const svg = fillColor
        ? asset.svg.replace(/currentColor/g, escapeXml(fillColor))
        : asset.svg;
      input = Buffer.from(svg);
    } else if (asset.buffer) {
      input = asset.buffer;
    } else {
      return undefined;
    }
    return sharp(input, { density: 400 })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }
  if (icon.startsWith("ms:")) {
    const iconName = icon.slice(3);
    const iconData = getIconData(materialSymbolsData, iconName);
    if (!iconData) return undefined;
    const renderData = iconToSVG(iconData);
    const [vx1 = 0, vy1 = 0, vw = 24, vh = 24] = renderData.viewBox ?? [0, 0, 24, 24];
    const color = fillColor ?? "#ffffff";
    const coloredBody = renderData.body.replace(/fill="currentColor"/g, `fill="${escapeXml(color)}"`);
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx1} ${vy1} ${vw} ${vh}" width="${size}" height="${size}">
      <g fill="${escapeXml(color)}">${coloredBody}</g>
    </svg>`;
    return sharp(Buffer.from(svgStr))
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }
  // Emoji / arbitrary text: rasterize with canvas.
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const fontSize = Math.round(size * 0.78);
  ctx.font = `${fontSize}px NotoColorEmoji, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, size / 2, size / 2);
  return canvas.toBuffer("image/png");
}

function cornerOffsets(
  position: "tl" | "tr" | "bl" | "br",
  tileWidth: number,
  tileHeight: number,
  iconSize: number,
  inset: number,
): { top: number; left: number } {
  switch (position) {
    case "tr":
      return { top: inset, left: tileWidth - iconSize - inset };
    case "bl":
      return { top: tileHeight - iconSize - inset, left: inset };
    case "br":
      return { top: tileHeight - iconSize - inset, left: tileWidth - iconSize - inset };
    case "tl":
    default:
      return { top: inset, left: inset };
  }
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

  async render(state: ButtonState, scrollTick = 0): Promise<Buffer> {
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

    // Layer 2: Icon (Buffer = image, string = emoji/text). Suppressed when a
    // bodyLabel is set — the big text IS the tile in that mode.
    if (!state.bodyLabel) {
      const iconPadding = state.iconFullBleed ? 0 : Math.round(width * 0.15);
      const iconSize = width - iconPadding * 2;
      const iconBuf = await resolveIconBuffer(state.icon, iconSize, state.iconColor);
      if (iconBuf) {
        overlays.push({ input: iconBuf, top: iconPadding, left: iconPadding });
      }
    }

    // Layer 2.5: Body label — large auto-sized wrapped text filling the tile.
    if (state.bodyLabel) {
      overlays.push({
        input: createBodyLabelBuffer(state.bodyLabel, width, height, state.bodyLabelColor ?? "#ffffff"),
      });
    }

    // Layer 3: Label text (bottom)
    if (state.label) {
      overlays.push({
        input: state.scrollLabel
          ? createScrollingSvgText(state.label, width, height, "bottom", scrollTick, state.labelColor)
          : createSvgText(state.label, width, height, "bottom", state.labelColor),
      });
    }

    // Layer 4: Top label text
    if (state.topLabel) {
      overlays.push({
        input: state.scrollTopLabel
          ? createScrollingSvgText(state.topLabel, width, height, "top", scrollTick, state.topLabelColor)
          : createSvgText(state.topLabel, width, height, "top", state.topLabelColor),
      });
    }

    // Layer 4.5: Corner icon — small plugin/state identifier in a tile corner.
    if (state.cornerIcon !== undefined) {
      const cornerSize = Math.round(width * 0.22);
      const cornerInset = Math.round(width * 0.08);
      const cornerBuf = await resolveIconBuffer(state.cornerIcon, cornerSize, state.cornerIconColor);
      if (cornerBuf) {
        const { top, left } = cornerOffsets(
          state.cornerIconPosition ?? "tl",
          width,
          height,
          cornerSize,
          cornerInset,
        );
        overlays.push({ input: cornerBuf, top, left });
      }
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

    // Layer 7: Opacity (darkening) — use linear brightness scaling instead of
    // a composite overlay, which breaks on some libvips builds with Buffer icons.
    if (state.opacity !== undefined && state.opacity < 1) {
      const multiplier = state.opacity;
      result = sharp(await result.removeAlpha().toColorspace("srgb").raw().toBuffer(), {
        raw: { width, height, channels: 3 },
      }).linear(multiplier, 0);
    }

    return result.removeAlpha().toColorspace("srgb").raw().toBuffer();
  }
}

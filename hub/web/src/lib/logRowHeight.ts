// Two-phase log row height prediction using @chenglou/pretext.
//
// Phase 1 — prepare (called once per LogLine as it arrives in useLogStream):
//   canvas.measureText() figures out how the msg string breaks across lines
//   at any future width. Result is an opaque PreparedText handle cached on
//   the line object itself via WeakMap.
//
// Phase 2 — layout (called by useVirtualizer's estimateSize on every frame):
//   Pure arithmetic: lineCount × lineHeight + paddingY. No canvas, no DOM.
//
// The font string MUST match what the browser renders. We use JetBrains Mono
// (the project's font-mono) at 12px (text-xs). In development the first
// render logs a warning if the prediction is off by more than 2px.

import { prepare, layout, type PreparedText } from "@chenglou/pretext";

// Matches Tailwind `font-mono text-xs leading-5` (line-height: 1.25rem = 20px).
// JetBrains Mono Variable is loaded via CSS; canvas falls back to JetBrains Mono,
// then the generic monospace stack.
export const LOG_ROW_FONT =
  '12px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';
export const LOG_ROW_LINE_HEIGHT = 20; // px — leading-5
export const LOG_ROW_PADDING_Y = 4;   // py-0.5 = 2px top + 2px bottom

// Fixed-width columns (px). These must match the widths rendered by LogRow.
// timestamp: "12:34:56 PM" = 11 chars × ~7.2px/char (JetBrains Mono 12px) ≈ 79px → 88px with margin
// badge:     "WARN"        ≈ 40px (w-10 = 2.5rem = 40px in the current Badge)
// [name]:    "[hub]"       ≈ 96px (w-24 = 6rem = 96px)
// gaps:      gap-2 = 8px between each of the 4 columns = 3 × 8px = 24px
export const TIMESTAMP_COL_W = 88;
export const BADGE_COL_W     = 48; // w-12 = 3rem = 48px, wide enough for "ERROR"
export const NAME_COL_W      = 96;
export const COL_GAP         = 8;
// Total fixed width consumed before the msg column (3 gaps for 4 columns).
export const LOG_ROW_FIXED_W =
  TIMESTAMP_COL_W + COL_GAP + BADGE_COL_W + COL_GAP + NAME_COL_W + COL_GAP;

// PreparedText handles keyed by LogLine object identity.
// WeakMap means entries are GC'd when lines leave the buffer.
const prepCache = new WeakMap<object, PreparedText>();

/** Call once per LogLine as it enters the buffer. Safe to call multiple times. */
export function prepareLogLine(line: { msg: string }): void {
  if (!prepCache.has(line) && line.msg.length > 0) {
    prepCache.set(line, prepare(line.msg, LOG_ROW_FONT));
  }
}

/**
 * Returns the predicted pixel height of a log row.
 * msgColumnWidth = containerWidth - LOG_ROW_FIXED_W.
 * O(1) arithmetic — no canvas work.
 */
export function logRowHeight(
  line: { msg: string },
  msgColumnWidth: number,
): number {
  const minH = LOG_ROW_LINE_HEIGHT + LOG_ROW_PADDING_Y;
  if (msgColumnWidth <= 0) return minH;
  const prepared = prepCache.get(line);
  if (!prepared) return minH; // empty msg or not yet prepared
  const { lineCount } = layout(prepared, msgColumnWidth, LOG_ROW_LINE_HEIGHT);
  return Math.max(lineCount, 1) * LOG_ROW_LINE_HEIGHT + LOG_ROW_PADDING_Y;
}

// Duration parse/format helpers — shared between hub UI and plugin schemas
// so a field declared as `durationUnit: "ms"` can be displayed and validated
// using the same rules everywhere.
//
// Parse: accepts compound human strings like "5s", "2m30s", "1h", "500ms",
// or a bare number (interpreted in the field's underlying unit).
// Format: picks the largest exact unit so 5000ms becomes "5s", 86400000 → "24h".

export type DurationUnit = "ms" | "s" | "m" | "h";

const UNIT_TO_MS: Record<DurationUnit, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
};

// Longest alternatives first so "seconds" doesn't get short-circuited to "s".
const TOKEN_RE = /(\d+(?:\.\d+)?)\s*(milliseconds?|seconds?|minutes?|hours?|ms|sec|min|hrs?|hr|h|m|s)/gi;

const TOKEN_UNIT: Record<string, DurationUnit> = {
  ms: "ms", millisecond: "ms", milliseconds: "ms",
  s: "s", sec: "s", secs: "s", second: "s", seconds: "s",
  m: "m", min: "m", mins: "m", minute: "m", minutes: "m",
  h: "h", hr: "h", hour: "h", hours: "h",
};

/**
 * Parse a human duration string into a number in `unit`. Returns `null` if the
 * input can't be interpreted. A bare number (e.g. "5000") is assumed to already
 * be in `unit`, so the field value round-trips without loss.
 */
export function parseDuration(text: string, unit: DurationUnit): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;

  // Bare number → assume already in target unit.
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  TOKEN_RE.lastIndex = 0;
  let totalMs = 0;
  let matched = false;
  let consumed = 0;
  for (const m of trimmed.matchAll(TOKEN_RE)) {
    matched = true;
    consumed += m[0]!.length;
    const value = Number(m[1]);
    const tokenUnit = TOKEN_UNIT[m[2]!.toLowerCase()];
    if (tokenUnit === undefined || Number.isNaN(value)) return null;
    totalMs += value * UNIT_TO_MS[tokenUnit];
  }
  if (!matched) return null;
  // Reject strings with leftover non-whitespace content between tokens.
  const nonWhitespace = trimmed.replace(/\s+/g, "").length;
  if (consumed < nonWhitespace) return null;

  return totalMs / UNIT_TO_MS[unit];
}

/**
 * Format a number (in `unit`) as a human-readable duration. Picks the
 * coarsest single unit that represents the value without fractional loss;
 * falls back to compound ("1h 30m") when no single unit is exact.
 */
export function formatDuration(value: number, unit: DurationUnit): string {
  if (!Number.isFinite(value)) return "";
  const totalMs = Math.round(value * UNIT_TO_MS[unit]);
  if (totalMs === 0) return `0${unit}`;

  // Pick the largest unit where the value is >= 1 of that unit. If the value
  // is an exact integer in that unit, emit a single token; otherwise fall
  // through to compound (largest meaningful unit down to smaller slices).
  const order: DurationUnit[] = ["h", "m", "s", "ms"];
  const largest = order.find((u) => totalMs >= UNIT_TO_MS[u]) ?? "ms";
  const largestFactor = UNIT_TO_MS[largest];
  if (totalMs % largestFactor === 0) {
    return `${totalMs / largestFactor}${largest}`;
  }

  let remaining = totalMs;
  const parts: string[] = [];
  for (const u of order) {
    const factor = UNIT_TO_MS[u];
    const slice = Math.floor(remaining / factor);
    if (slice > 0) {
      parts.push(`${slice}${u}`);
      remaining -= slice * factor;
    }
  }
  return parts.join(" ") || `${totalMs}ms`;
}

/**
 * Key index remapping for Mirabox AKP153E (5x3 grid).
 *
 * The device numbers keys 1-15 starting at the top-right, going left across
 * each row, then wrapping down. OmniDeck uses 0-based indices from the
 * top-left, going right.
 *
 * Mirabox layout:      Standard layout:
 *   5  4  3  2  1        0  1  2  3  4
 *  10  9  8  7  6        5  6  7  8  9
 *  15 14 13 12 11       10 11 12 13 14
 */

const COLUMNS = 5;

/**
 * Convert a 1-based Mirabox key ID (top-right origin) to a 0-based
 * OmniDeck standard key index (top-left origin).
 */
export function miraboxToStandard(miraboxKey: number): number {
  if (miraboxKey < 1 || miraboxKey > 15) {
    throw new RangeError(`Mirabox key ID must be 1-15, got ${miraboxKey}`);
  }
  const idx = miraboxKey - 1; // 0-based
  const row = Math.floor(idx / COLUMNS);
  const colFromRight = idx % COLUMNS;
  const col = (COLUMNS - 1) - colFromRight; // mirror horizontally
  return row * COLUMNS + col;
}

/**
 * Convert a 0-based OmniDeck standard key index (top-left origin) to a
 * 1-based Mirabox key ID (top-right origin).
 */
export function standardToMirabox(standardKey: number): number {
  if (standardKey < 0 || standardKey > 14) {
    throw new RangeError(`Standard key index must be 0-14, got ${standardKey}`);
  }
  const row = Math.floor(standardKey / COLUMNS);
  const col = standardKey % COLUMNS;
  const colFromRight = (COLUMNS - 1) - col; // mirror horizontally
  return row * COLUMNS + colFromRight + 1; // 1-based
}

/**
 * Key index remapping for Mirabox AKP153E (5x3 grid).
 *
 * The device numbers keys 1-15 using column-major ordering: columns run
 * right-to-left, and within each column keys are numbered top-to-bottom.
 * OmniDeck uses 0-based row-major indices from the top-left.
 *
 * Mirabox layout:      Standard layout:
 *  13  10   7   4   1     0   1   2   3   4
 *  14  11   8   5   2     5   6   7   8   9
 *  15  12   9   6   3    10  11  12  13  14
 */

const COLUMNS = 5;
const ROWS = 3;

/**
 * Convert a 1-based Mirabox key ID to a 0-based OmniDeck standard key index.
 */
export function miraboxToStandard(miraboxKey: number): number {
  if (miraboxKey < 1 || miraboxKey > 15) {
    throw new RangeError(`Mirabox key ID must be 1-15, got ${miraboxKey}`);
  }
  const idx = miraboxKey - 1; // 0-based
  const colFromRight = Math.floor(idx / ROWS);
  const row = idx % ROWS;
  const col = (COLUMNS - 1) - colFromRight;
  return row * COLUMNS + col;
}

/**
 * Convert a 0-based OmniDeck standard key index to a 1-based Mirabox key ID.
 */
export function standardToMirabox(standardKey: number): number {
  if (standardKey < 0 || standardKey > 14) {
    throw new RangeError(`Standard key index must be 0-14, got ${standardKey}`);
  }
  const row = Math.floor(standardKey / COLUMNS);
  const col = standardKey % COLUMNS;
  const colFromRight = (COLUMNS - 1) - col;
  return colFromRight * ROWS + row + 1; // 1-based
}

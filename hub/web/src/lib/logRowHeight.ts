// Log row height — constant because rows are whitespace-nowrap.
//
// Since rows never wrap, height is always exactly one line regardless of
// message length or container width. No canvas measurement, no ResizeObserver,
// no Pretext needed. estimateSize returns LOG_ROW_HEIGHT for every row.
//
// If wrapping is ever needed in future, the two-phase Pretext approach
// (prepare/layout) can be reintroduced here without changing the consumers.

export const LOG_ROW_LINE_HEIGHT = 20; // px — leading-5 / text-xs
export const LOG_ROW_PADDING_Y   = 4;  // py-0.5 = 2px top + 2px bottom
export const LOG_ROW_HEIGHT      = LOG_ROW_LINE_HEIGHT + LOG_ROW_PADDING_Y;

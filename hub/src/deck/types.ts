/** A single addressable image region within a DisplayArea. */
export interface DisplaySegment {
  /** Device-specific addressing ID (e.g. 0x10–0x12 for Mirabox strip). */
  id: number;
  /** Pixel offset within the DisplayArea (top-left origin). */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A named LCD surface that exists outside the main button grid —
 * e.g. the Mirabox side strip or Stream Deck+ touchbar.
 *
 * Physical layout is expressed in absolute pixels; position relative to the
 * button grid is expressed as a column/row index so the page renderer can
 * route buttons to the right surface without knowing device specifics.
 */
export interface DisplayArea {
  /** Stable identifier used in API calls (e.g. "strip", "lcd-bar"). */
  id: string;
  /** Total pixel dimensions of the surface. */
  pixelWidth: number;
  pixelHeight: number;
  /** Where this area sits relative to the button grid. */
  layoutAnchor: { edge: "left" | "right" | "top" | "bottom"; offset: number };
  /** Individually-addressable sub-regions within the surface. */
  segments: DisplaySegment[];
  /** Whether physical presses on this surface generate input events. */
  supportsInput: boolean;
  /** Whether arbitrary x/y sub-regions can be updated independently. */
  supportsRegionalWrite: boolean;
  /** Column index in the page layout grid where this area appears. */
  col: number;
  /** Number of grid row-slots this area occupies. */
  rows: number;
}

export interface DeckCapabilities {
  /** Device reports key-up events. False = no long-press or press/release actions. */
  hasKeyUp: boolean;
  /** Device reports long-press natively (bypasses 500ms software timer). */
  hasHardwareLongPress: boolean;
  /** Keys have individual LCD screens. False for e.g. Stream Deck Pedal. */
  hasDisplay: boolean;
}

export interface DeckManager {
  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onConnect(cb: () => void): void;
  onDisconnect(cb: () => void): void;

  // Input
  onKeyDown(cb: (key: number) => void): void;
  onKeyUp(cb: (key: number) => void): void;
  onLongPress(cb: (key: number) => void): void;

  // Output — main button grid
  setKeyImage(key: number, buffer: Buffer): Promise<void>;
  setBrightness(percent: number): Promise<void>;
  /** Commit all pending key image writes to the display. No-op on most devices. */
  flush(): Promise<void>;

  // Output — display areas (LCD surfaces outside the main button grid)
  /** Raw RGB buffer `buf` (w×h pixels) sent to position (x,y) within the named area. */
  fillDisplayRegion(areaId: string, x: number, y: number, buf: Buffer, w: number, h: number): Promise<void>;
  /** Clear all segments of the named area to black. */
  clearDisplayArea(areaId: string): Promise<void>;

  // Info
  readonly driver: string;
  readonly model: string;
  readonly keyCount: number;
  readonly keySize: { width: number; height: number };
  readonly keyColumns: number;
  readonly capabilities: DeckCapabilities;
  readonly displayAreas: DisplayArea[];
}

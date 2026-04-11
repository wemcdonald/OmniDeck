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

  // Output
  setKeyImage(key: number, buffer: Buffer): Promise<void>;
  setBrightness(percent: number): Promise<void>;
  /** Commit all pending key image writes to the display. No-op on most devices. */
  flush(): Promise<void>;

  // Info
  readonly driver: string;
  readonly model: string;
  readonly keyCount: number;
  readonly keySize: { width: number; height: number };
  readonly keyColumns: number;
  readonly capabilities: DeckCapabilities;
}

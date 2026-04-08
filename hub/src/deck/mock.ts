import type { DeckCapabilities } from "./types.js";
import { BaseDeck } from "./base.js";

export class MockDeck extends BaseDeck {
  readonly keyCount: number;
  readonly keyColumns: number;
  readonly keySize: { width: number; height: number };

  private _capabilities: DeckCapabilities;

  /** Track images set on keys for assertions */
  public images = new Map<number, Buffer>();
  public brightness = 100;
  public connected = false;

  constructor(opts?: {
    keyCount?: number;
    columns?: number;
    keySize?: number;
    capabilities?: Partial<DeckCapabilities>;
  }) {
    super();
    this.keyCount = opts?.keyCount ?? 15;
    this.keyColumns = opts?.columns ?? 5;
    const size = opts?.keySize ?? 96;
    this.keySize = { width: size, height: size };
    this._capabilities = {
      hasKeyUp: true,
      hasHardwareLongPress: false,
      hasDisplay: true,
      ...opts?.capabilities,
    };
  }

  get driver(): string { return "mock"; }
  get model(): string { return "MockDeck"; }
  get capabilities(): DeckCapabilities { return this._capabilities; }

  async connect(): Promise<void> {
    this.connected = true;
    this.emitConnect();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emitDisconnect();
  }

  async setKeyImage(key: number, buffer: Buffer): Promise<void> {
    this.images.set(key, buffer);
  }

  async setBrightness(percent: number): Promise<void> {
    this.brightness = percent;
  }

  // Test helpers
  simulateKeyDown(key: number): void { this.emitKeyDown(key); }
  simulateKeyUp(key: number): void { this.emitKeyUp(key); }
  simulateLongPress(key: number): void { this.emitLongPress(key); }
}

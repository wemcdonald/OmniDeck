import type { DeckManager } from "./types.js";

export class MockDeck implements DeckManager {
  readonly model = "MockDeck";
  readonly keyCount: number;
  readonly keySize = { width: 96, height: 96 };
  readonly keyColumns: number;

  private keyDownCbs: Array<(key: number) => void> = [];
  private keyUpCbs: Array<(key: number) => void> = [];
  private connectCbs: Array<() => void> = [];
  private disconnectCbs: Array<() => void> = [];

  /** Track images set on keys for assertions */
  public images = new Map<number, Buffer>();
  public brightness = 100;
  public connected = false;

  constructor(opts?: { keyCount?: number; columns?: number }) {
    this.keyCount = opts?.keyCount ?? 15;
    this.keyColumns = opts?.columns ?? 5;
  }

  async connect(): Promise<void> {
    this.connected = true;
    for (const cb of this.connectCbs) cb();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    for (const cb of this.disconnectCbs) cb();
  }

  onConnect(cb: () => void): void {
    this.connectCbs.push(cb);
  }

  onDisconnect(cb: () => void): void {
    this.disconnectCbs.push(cb);
  }

  onKeyDown(cb: (key: number) => void): void {
    this.keyDownCbs.push(cb);
  }

  onKeyUp(cb: (key: number) => void): void {
    this.keyUpCbs.push(cb);
  }

  async setKeyImage(key: number, buffer: Buffer): Promise<void> {
    this.images.set(key, buffer);
  }

  async setBrightness(percent: number): Promise<void> {
    this.brightness = percent;
  }

  // Test helpers
  simulateKeyDown(key: number): void {
    for (const cb of this.keyDownCbs) cb(key);
  }

  simulateKeyUp(key: number): void {
    for (const cb of this.keyUpCbs) cb(key);
  }
}

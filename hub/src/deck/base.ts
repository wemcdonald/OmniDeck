import type { DeckCapabilities, DeckManager } from "./types.js";

/**
 * Abstract base class that handles callback registration and dispatch for all
 * DeckManager implementations. Eliminates boilerplate duplicated across drivers.
 */
export abstract class BaseDeck implements DeckManager {
  private keyDownCbs: Array<(key: number) => void> = [];
  private keyUpCbs: Array<(key: number) => void> = [];
  private longPressCbs: Array<(key: number) => void> = [];
  private connectCbs: Array<() => void> = [];
  private disconnectCbs: Array<() => void> = [];

  // Registration
  onKeyDown(cb: (key: number) => void): void { this.keyDownCbs.push(cb); }
  onKeyUp(cb: (key: number) => void): void { this.keyUpCbs.push(cb); }
  onLongPress(cb: (key: number) => void): void { this.longPressCbs.push(cb); }
  onConnect(cb: () => void): void { this.connectCbs.push(cb); }
  onDisconnect(cb: () => void): void { this.disconnectCbs.push(cb); }

  // Dispatch (for subclasses)
  protected emitKeyDown(key: number): void { for (const cb of this.keyDownCbs) cb(key); }
  protected emitKeyUp(key: number): void { for (const cb of this.keyUpCbs) cb(key); }
  protected emitLongPress(key: number): void { for (const cb of this.longPressCbs) cb(key); }
  protected emitConnect(): void { for (const cb of this.connectCbs) cb(); }
  protected emitDisconnect(): void { for (const cb of this.disconnectCbs) cb(); }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract setKeyImage(key: number, buffer: Buffer): Promise<void>;
  abstract setBrightness(percent: number): Promise<void>;

  abstract get driver(): string;
  abstract get model(): string;
  abstract get keyCount(): number;
  abstract get keySize(): { width: number; height: number };
  abstract get keyColumns(): number;
  abstract get capabilities(): DeckCapabilities;
}

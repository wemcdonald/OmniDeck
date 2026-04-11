import type { DeckCapabilities, DeckManager } from "./types.js";

const RECONNECT_INTERVAL_MS = 2000;

/**
 * Abstract base class that handles callback registration, dispatch, and
 * automatic reconnection for all DeckManager implementations.
 *
 * Reconnect behaviour: subclasses call `scheduleReconnect()` from their
 * error handlers. BaseDeck retries `connect()` every 2s until it succeeds
 * or `stopReconnecting()` is called (i.e. explicit `disconnect()`).
 * On success, `connect()` calls `emitConnect()` as usual — the hub's
 * onConnect handler then re-renders the current page.
 */
export abstract class BaseDeck implements DeckManager {
  private keyDownCbs: Array<(key: number) => void> = [];
  private keyUpCbs: Array<(key: number) => void> = [];
  private longPressCbs: Array<(key: number) => void> = [];
  private connectCbs: Array<() => void> = [];
  private disconnectCbs: Array<() => void> = [];

  private reconnecting = false;

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

  /**
   * Start polling `connect()` every 2s. Call from an error handler after
   * emitting disconnect. No-op if a reconnect loop is already running.
   */
  protected scheduleReconnect(): void {
    if (this.reconnecting) return;
    this.reconnecting = true;
    void this.reconnectLoop();
  }

  /** Stop the reconnect loop. Call from explicit `disconnect()`. */
  protected stopReconnecting(): void {
    this.reconnecting = false;
  }

  private async reconnectLoop(): Promise<void> {
    while (this.reconnecting) {
      await new Promise<void>((r) => setTimeout(r, RECONNECT_INTERVAL_MS));
      if (!this.reconnecting) return;
      try {
        await this.connect();
        // connect() called emitConnect() on success — we're done
        this.reconnecting = false;
      } catch {
        // Device not ready yet — keep polling silently
      }
    }
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract setKeyImage(key: number, buffer: Buffer): Promise<void>;
  abstract setBrightness(percent: number): Promise<void>;
  async flush(): Promise<void> { /* no-op for most devices */ }

  abstract get driver(): string;
  abstract get model(): string;
  abstract get keyCount(): number;
  abstract get keySize(): { width: number; height: number };
  abstract get keyColumns(): number;
  abstract get capabilities(): DeckCapabilities;
}

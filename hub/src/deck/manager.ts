import {
  listStreamDecks,
  openStreamDeck,
  type StreamDeck,
  type StreamDeckButtonControlDefinition,
} from "@elgato-stream-deck/node";
import type { DeckManager } from "./types.js";
import { createLogger } from "../logger.js";

const log = createLogger("deck");

export class PhysicalDeck implements DeckManager {
  private device: StreamDeck | null = null;
  private keyDownCbs: Array<(key: number) => void> = [];
  private keyUpCbs: Array<(key: number) => void> = [];
  private connectCbs: Array<() => void> = [];
  private disconnectCbs: Array<() => void> = [];

  private _model = "unknown";
  private _keyCount = 0;
  private _keySize = { width: 72, height: 72 };
  private _keyColumns = 5;

  get model(): string {
    return this._model;
  }
  get keyCount(): number {
    return this._keyCount;
  }
  get keySize(): { width: number; height: number } {
    return this._keySize;
  }
  get keyColumns(): number {
    return this._keyColumns;
  }

  async connect(): Promise<void> {
    const devices = await listStreamDecks();
    if (devices.length === 0) {
      throw new Error("No Stream Deck devices found");
    }

    const devicePath = devices[0].path;
    try {
      this.device = await openStreamDeck(devicePath);

      this._model = this.device.PRODUCT_NAME;

      // Derive layout from CONTROLS array
      const buttonControls = this.device.CONTROLS.filter(
        (c): c is StreamDeckButtonControlDefinition => c.type === "button",
      );
      this._keyCount = buttonControls.length;

      const maxColumn =
        buttonControls.reduce((max, c) => Math.max(max, c.column), 0) + 1;
      this._keyColumns = maxColumn;

      // Key size comes from the lcd feedback definition if available; fall back to 72
      const lcdButton = buttonControls.find(
        (c) => c.feedbackType === "lcd",
      ) as (StreamDeckButtonControlDefinition & { pixelSize?: { width: number; height: number } }) | undefined;
      if (lcdButton?.pixelSize) {
        this._keySize = {
          width: lcdButton.pixelSize.width,
          height: lcdButton.pixelSize.height,
        };
      }

      this.device.on("down", (control) => {
        if (control.type === "button") {
          for (const cb of this.keyDownCbs) cb(control.index);
        }
      });

      this.device.on("up", (control) => {
        if (control.type === "button") {
          for (const cb of this.keyUpCbs) cb(control.index);
        }
      });

      this.device.on("error", (err) => {
        log.error({ err }, "Stream Deck error");
        for (const cb of this.disconnectCbs) cb();
      });

      log.info(
        { model: this._model, keys: this._keyCount },
        "Stream Deck connected",
      );
      for (const cb of this.connectCbs) cb();
    } catch (err) {
      log.error({ err }, "Failed to connect to Stream Deck");
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      await this.device.close();
      this.device = null;
      for (const cb of this.disconnectCbs) cb();
    }
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
    if (!this.device) return;
    await this.device.fillKeyBuffer(key, buffer);
  }

  async setBrightness(percent: number): Promise<void> {
    if (!this.device) return;
    await this.device.setBrightness(percent);
  }
}

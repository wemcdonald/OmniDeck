import {
  listStreamDecks,
  openStreamDeck,
  type StreamDeck,
  type StreamDeckButtonControlDefinition,
} from "@elgato-stream-deck/node";
import type { DeckCapabilities } from "./types.js";
import { BaseDeck } from "./base.js";
import { createLogger } from "../logger.js";

const log = createLogger("deck");

export class ElgatoDeck extends BaseDeck {
  private device: StreamDeck | null = null;

  private _model = "unknown";
  private _keyCount = 0;
  private _keySize = { width: 72, height: 72 };
  private _keyColumns = 5;
  private _hasDisplay = true;

  get driver(): string { return "elgato"; }
  get model(): string { return this._model; }
  get keyCount(): number { return this._keyCount; }
  get keySize(): { width: number; height: number } { return this._keySize; }
  get keyColumns(): number { return this._keyColumns; }
  get capabilities(): DeckCapabilities {
    return {
      hasKeyUp: true,
      hasHardwareLongPress: false,
      hasDisplay: this._hasDisplay,
    };
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

      // Determine display capability from whether any button has lcd feedback
      this._hasDisplay = buttonControls.some((c) => c.feedbackType === "lcd");

      this.device.on("down", (control) => {
        if (control.type === "button") {
          this.emitKeyDown(control.index);
        }
      });

      this.device.on("up", (control) => {
        if (control.type === "button") {
          this.emitKeyUp(control.index);
        }
      });

      this.device.on("error", (err) => {
        log.error({ err }, "Stream Deck error — will attempt reconnect");
        try { this.device?.close(); } catch { /* ignore */ }
        this.device = null;
        this.emitDisconnect();
        this.scheduleReconnect();
      });

      log.info(
        { model: this._model, keys: this._keyCount },
        "Stream Deck connected",
      );
      this.emitConnect();
    } catch (err) {
      log.error({ err }, "Failed to connect to Stream Deck");
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.stopReconnecting();
    if (this.device) {
      await this.device.close();
      this.device = null;
      this.emitDisconnect();
    }
  }

  async setKeyImage(key: number, buffer: Buffer): Promise<void> {
    if (!this.device) return;
    await this.device.fillKeyBuffer(key, buffer, { format: "rgb" });
  }

  async setBrightness(percent: number): Promise<void> {
    if (!this.device) return;
    await this.device.setBrightness(percent);
  }
}

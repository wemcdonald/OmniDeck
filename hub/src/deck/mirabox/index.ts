import type { DeckCapabilities } from "../types.js";
import { BaseDeck } from "../base.js";
import { MIRABOX_VID, HARDWARE_BY_PID, type MiraboxHardwareConfig } from "./types.js";
import { miraboxToStandard, standardToMirabox } from "./keymap.js";
import { encodeKeyImage } from "./image.js";
import {
  buildInitDisplay,
  buildBrightness,
  buildClear,
  buildImagePackets,
  parseInputReport,
} from "./protocol.js";
import { createLogger } from "../../logger.js";

const log = createLogger("deck:mirabox");

/** HID usage page for Mirabox stream dock functionality */
const MIRABOX_USAGE_PAGE = 0xff60;

export class MiraboxDeck extends BaseDeck {
  private device: import("node-hid").HID | null = null;
  private config: MiraboxHardwareConfig | null = null;

  get driver(): string { return "mirabox"; }

  get model(): string {
    return this.config ? `Mirabox ${this.config.name}` : "Mirabox (unknown)";
  }

  get keyCount(): number { return 15; }
  get keyColumns(): number { return 5; }

  get keySize(): { width: number; height: number } {
    const size = this.config?.keyImageSize ?? 85;
    return { width: size, height: size };
  }

  get capabilities(): DeckCapabilities {
    return {
      hasKeyUp: this.config?.hasKeyUp ?? false,
      hasHardwareLongPress: this.config?.hasHardwareLongPress ?? false,
      hasDisplay: true,
    };
  }

  /**
   * Enumerate connected HID devices and return the first matching Mirabox
   * hardware config, or null if no device is found. Does not open the device.
   */
  static detect(): MiraboxHardwareConfig | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const HID = require("node-hid") as typeof import("node-hid");
      const devices = HID.devices();
      for (const d of devices) {
        if (d.vendorId === MIRABOX_VID && d.productId !== undefined) {
          const config = HARDWARE_BY_PID.get(d.productId);
          if (config) return config;
        }
      }
    } catch {
      // node-hid not available
    }
    return null;
  }

  async connect(): Promise<void> {
    // Dynamic import keeps node-hid out of the require chain for Elgato-only setups
    const HID = (await import("node-hid")).default as typeof import("node-hid");

    // Find the first matching device
    const devices = HID.devices();
    let foundPath: string | undefined;
    let foundConfig: MiraboxHardwareConfig | undefined;

    for (const d of devices) {
      if (d.vendorId !== MIRABOX_VID || d.productId === undefined) continue;
      const config = HARDWARE_BY_PID.get(d.productId);
      if (!config) continue;
      // Prefer the vendor-specific usage page (0xff60) on systems that expose it;
      // fall back to the first matching path
      if (!foundPath || d.usagePage === MIRABOX_USAGE_PAGE) {
        foundPath = d.path;
        foundConfig = config;
      }
    }

    if (!foundPath || !foundConfig) {
      throw new Error(
        `No Mirabox device found. Supported PIDs: ${[...HARDWARE_BY_PID.keys()].map((p) => `0x${p.toString(16)}`).join(", ")}`,
      );
    }

    this.config = foundConfig;

    try {
      this.device = new HID.HID(foundPath);
    } catch (err) {
      throw new Error(`Failed to open Mirabox device at ${foundPath}: ${err}`);
    }

    // Initialize display
    this.write(buildInitDisplay(this.config.packetSize));
    this.write(buildBrightness(100, this.config.packetSize));

    // Set up input listener
    this.device.on("data", (data: Buffer) => {
      const event = parseInputReport(data);
      if (!event) return;

      const standardKey = miraboxToStandard(event.keyId);

      if (event.event === "down") {
        this.emitKeyDown(standardKey);
      } else if (event.event === "up") {
        this.emitKeyUp(standardKey);
      } else if (event.event === "longpress") {
        this.emitLongPress(standardKey);
      }
    });

    this.device.on("error", (err: Error) => {
      log.error({ err }, "Mirabox HID error");
      this.emitDisconnect();
    });

    log.info(
      { model: this.model, pid: `0x${foundConfig.pid.toString(16)}`, protocol: foundConfig.protocolVersion },
      "Mirabox device connected",
    );
    this.emitConnect();
  }

  async disconnect(): Promise<void> {
    if (this.device && this.config) {
      try {
        this.write(buildClear(0xff, this.config.packetSize));
        this.device.close();
      } catch {
        // Ignore errors on disconnect
      }
      this.device = null;
    }
    this.emitDisconnect();
  }

  async setKeyImage(key: number, rgb: Buffer): Promise<void> {
    if (!this.device || !this.config) return;

    const miraboxKey = standardToMirabox(key);
    const jpeg = await encodeKeyImage(rgb, this.keySize, this.config.keyImageSize);
    const packets = buildImagePackets(miraboxKey, jpeg, this.config.packetSize);

    for (const packet of packets) {
      this.write(packet);
    }
  }

  async setBrightness(percent: number): Promise<void> {
    if (!this.device || !this.config) return;
    this.write(buildBrightness(percent, this.config.packetSize));
  }

  private write(packet: Buffer): void {
    if (!this.device) return;
    try {
      this.device.write([...packet]);
    } catch (err) {
      log.error({ err }, "Mirabox HID write error");
    }
  }
}

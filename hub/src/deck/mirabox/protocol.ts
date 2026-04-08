/**
 * Low-level HID protocol for Mirabox AKP153E devices.
 *
 * All commands share a common framing:
 *   Byte 0:     0x00  (HID report ID)
 *   Bytes 1-3:  "CRT" (0x43 0x52 0x54) — command header
 *   Bytes 4-5:  0x00 0x00 — padding
 *   Bytes 6-8:  3-letter ASCII command code
 *   Bytes 9-10: 0x00 0x00 — padding
 *   Bytes 11+:  command-specific payload
 *   Remaining:  zero-padded to packetSize bytes
 *
 * Reference: https://github.com/dvortsis/ajazz-companion-bridge
 *            https://github.com/Uriziel01/Ajazz-AKP153-reverse-engineering
 */

const CRT_HEADER = [0x00, 0x43, 0x52, 0x54, 0x00, 0x00];
const PADDING = [0x00, 0x00];

/**
 * Build a zero-padded command packet.
 * @param code  3-character ASCII command (e.g. "DIS", "LIG")
 * @param payload  Command-specific bytes following the header
 * @param packetSize  Total packet length (512 for v1, 1024 for v3)
 */
export function buildCommand(
  code: string,
  payload: number[],
  packetSize: number,
): Buffer {
  const codeBytes = [code.charCodeAt(0), code.charCodeAt(1), code.charCodeAt(2)];
  const packet = Buffer.alloc(packetSize, 0);
  let offset = 0;
  for (const b of [...CRT_HEADER, ...codeBytes, ...PADDING, ...payload]) {
    packet[offset++] = b;
  }
  return packet;
}

/** DIS — initialize / wake the display */
export function buildInitDisplay(packetSize: number): Buffer {
  return buildCommand("DIS", [0x01], packetSize);
}

/** LIG — set brightness (0-100) */
export function buildBrightness(percent: number, packetSize: number): Buffer {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return buildCommand("LIG", [clamped], packetSize);
}

/**
 * CLE — clear a key (or all keys if keyId is 0xFF).
 * @param keyId  1-based Mirabox key ID, or 0xFF to clear all
 */
export function buildClear(keyId: number, packetSize: number): Buffer {
  return buildCommand("CLE", [keyId], packetSize);
}

/** HAN — put device to sleep */
export function buildSleep(packetSize: number): Buffer {
  return buildCommand("HAN", [], packetSize);
}

/**
 * Build the sequence of HID packets to upload a JPEG image to a key.
 *
 * Sequence:
 *   1. BAT packet: signals start of image transfer, includes key ID and JPEG size
 *   2. One or more data packets: raw JPEG bytes, chunked to packetSize
 *   3. STP packet: commits the image
 *
 * @param keyId   1-based Mirabox key ID
 * @param jpeg    JPEG image data
 * @param packetSize  HID packet size (512 or 1024)
 */
export function buildImagePackets(
  keyId: number,
  jpeg: Buffer,
  packetSize: number,
): Buffer[] {
  const packets: Buffer[] = [];

  // BAT (begin): includes 2-byte big-endian JPEG size and 1-byte key ID
  const jpegSize = jpeg.length;
  const batPayload = [
    (jpegSize >> 8) & 0xff,
    jpegSize & 0xff,
    keyId,
  ];
  packets.push(buildCommand("BAT", batPayload, packetSize));

  // Data packets: chunk the JPEG. Each packet is a raw HID report (report ID 0x00
  // in byte 0, then up to packetSize-1 bytes of JPEG data).
  const chunkSize = packetSize - 1; // first byte is always 0x00 report ID
  for (let offset = 0; offset < jpeg.length; offset += chunkSize) {
    const chunk = jpeg.subarray(offset, offset + chunkSize);
    const packet = Buffer.alloc(packetSize, 0);
    packet[0] = 0x00; // HID report ID
    chunk.copy(packet, 1);
    packets.push(packet);
  }

  // STP (stop): commits the image
  packets.push(buildCommand("STP", [keyId], packetSize));

  return packets;
}

export type InputEvent =
  | { keyId: number; event: "down" }
  | { keyId: number; event: "up" }
  | { keyId: number; event: "longpress" };

/**
 * Parse a raw HID input report into a key event.
 *
 * Protocol v1: reports start with "ACK" (0x41 0x43 0x4B), key ID at byte 9.
 *              Only key-down events are emitted.
 * Protocol v3: same header, key ID at byte 9, state at byte 10
 *              (0x01 = down, 0x02 = up, 0x03 = long-press).
 *
 * Returns null if the report is not a recognised key event.
 */
export function parseInputReport(data: Buffer): InputEvent | null {
  // Must have at least 11 bytes and start with ACK header
  if (data.length < 11) return null;
  if (data[0] !== 0x41 || data[1] !== 0x43 || data[2] !== 0x4b) return null;

  const keyId = data[9];
  if (keyId < 1 || keyId > 15) return null;

  const state = data[10];

  // Protocol v1: state byte is always 0 (only down events)
  if (state === 0x00 || state === 0x01) {
    return { keyId, event: "down" };
  }
  if (state === 0x02) {
    return { keyId, event: "up" };
  }
  if (state === 0x03) {
    return { keyId, event: "longpress" };
  }

  return null;
}

import { describe, it, expect } from "vitest";
import {
  buildCommand,
  buildInitDisplay,
  buildBrightness,
  buildClear,
  buildImagePackets,
  parseInputReport,
} from "../protocol.js";

describe("buildCommand", () => {
  it("builds a correctly framed packet", () => {
    const pkt = buildCommand("DIS", [0x01], 512);
    expect(pkt.length).toBe(512);
    // Report ID
    expect(pkt[0]).toBe(0x00);
    // CRT header
    expect(pkt[1]).toBe(0x43); // C
    expect(pkt[2]).toBe(0x52); // R
    expect(pkt[3]).toBe(0x54); // T
    // Padding
    expect(pkt[4]).toBe(0x00);
    expect(pkt[5]).toBe(0x00);
    // Command code "DIS"
    expect(pkt[6]).toBe(0x44); // D
    expect(pkt[7]).toBe(0x49); // I
    expect(pkt[8]).toBe(0x53); // S
    // Padding
    expect(pkt[9]).toBe(0x00);
    expect(pkt[10]).toBe(0x00);
    // Payload
    expect(pkt[11]).toBe(0x01);
    // Rest is zero
    expect(pkt.slice(12).every((b) => b === 0)).toBe(true);
  });

  it("zero-pads to packetSize for v3 (1024)", () => {
    const pkt = buildCommand("LIG", [50], 1024);
    expect(pkt.length).toBe(1024);
    expect(pkt[11]).toBe(50);
  });
});

describe("buildInitDisplay", () => {
  it("sends DIS command with 0x01 payload", () => {
    const pkt = buildInitDisplay(512);
    expect(pkt[6]).toBe(0x44); // D
    expect(pkt[7]).toBe(0x49); // I
    expect(pkt[8]).toBe(0x53); // S
    expect(pkt[11]).toBe(0x01);
  });
});

describe("buildBrightness", () => {
  it("sends LIG command with correct brightness byte", () => {
    const pkt = buildBrightness(75, 512);
    expect(pkt[6]).toBe(0x4c); // L
    expect(pkt[7]).toBe(0x49); // I
    expect(pkt[8]).toBe(0x47); // G
    expect(pkt[11]).toBe(75);
  });

  it("clamps brightness to [0, 100]", () => {
    expect(buildBrightness(-10, 512)[11]).toBe(0);
    expect(buildBrightness(200, 512)[11]).toBe(100);
  });
});

describe("buildClear", () => {
  it("sends CLE command with the key ID", () => {
    const pkt = buildClear(3, 512);
    expect(pkt[6]).toBe(0x43); // C
    expect(pkt[7]).toBe(0x4c); // L
    expect(pkt[8]).toBe(0x45); // E
    expect(pkt[11]).toBe(3);
  });

  it("sends 0xFF to clear all keys", () => {
    const pkt = buildClear(0xff, 512);
    expect(pkt[11]).toBe(0xff);
  });
});

describe("buildImagePackets", () => {
  it("produces BAT + data chunks + STP", () => {
    const jpeg = Buffer.alloc(100, 0xaa);
    const packets = buildImagePackets(1, jpeg, 512);
    // BAT + 1 data chunk (100 bytes fits in one 511-byte chunk) + STP
    expect(packets.length).toBe(3);
  });

  it("BAT packet encodes key ID and JPEG size", () => {
    const jpeg = Buffer.alloc(300);
    const packets = buildImagePackets(5, jpeg, 512);
    const bat = packets[0];
    // Command code "BAT"
    expect(bat[6]).toBe(0x42); // B
    expect(bat[7]).toBe(0x41); // A
    expect(bat[8]).toBe(0x54); // T
    // Size big-endian at bytes 11-12
    expect(bat[11]).toBe((300 >> 8) & 0xff);
    expect(bat[12]).toBe(300 & 0xff);
    // Key ID at byte 13
    expect(bat[13]).toBe(5);
  });

  it("STP packet contains key ID", () => {
    const jpeg = Buffer.alloc(10);
    const packets = buildImagePackets(7, jpeg, 512);
    const stp = packets[packets.length - 1];
    expect(stp[6]).toBe(0x53); // S
    expect(stp[7]).toBe(0x54); // T
    expect(stp[8]).toBe(0x50); // P
    expect(stp[11]).toBe(7);
  });

  it("splits large JPEG across multiple data packets", () => {
    // packetSize=512, chunkSize=511. 1022 bytes → 2 data packets
    const jpeg = Buffer.alloc(1022, 0xff);
    const packets = buildImagePackets(1, jpeg, 512);
    // BAT + 2 data + STP = 4
    expect(packets.length).toBe(4);
  });

  it("each data packet starts with report ID 0x00", () => {
    const jpeg = Buffer.alloc(50);
    const packets = buildImagePackets(1, jpeg, 512);
    // Data packet is packets[1]
    expect(packets[1][0]).toBe(0x00);
  });
});

describe("parseInputReport", () => {
  function makeReport(keyId: number, state: number): Buffer {
    const buf = Buffer.alloc(16, 0);
    buf[0] = 0x41; // A
    buf[1] = 0x43; // C
    buf[2] = 0x4b; // K
    buf[9] = keyId;
    buf[10] = state;
    return buf;
  }

  it("returns null for non-ACK reports", () => {
    const buf = Buffer.alloc(16, 0);
    expect(parseInputReport(buf)).toBeNull();
  });

  it("returns null for too-short reports", () => {
    const buf = Buffer.from([0x41, 0x43, 0x4b]);
    expect(parseInputReport(buf)).toBeNull();
  });

  it("parses key-down (state=0x01)", () => {
    const result = parseInputReport(makeReport(3, 0x01));
    expect(result).toEqual({ keyId: 3, event: "down" });
  });

  it("parses key-down for v1 protocol (state=0x00)", () => {
    const result = parseInputReport(makeReport(5, 0x00));
    expect(result).toEqual({ keyId: 5, event: "down" });
  });

  it("parses key-up (state=0x02)", () => {
    const result = parseInputReport(makeReport(7, 0x02));
    expect(result).toEqual({ keyId: 7, event: "up" });
  });

  it("parses long-press (state=0x03)", () => {
    const result = parseInputReport(makeReport(2, 0x03));
    expect(result).toEqual({ keyId: 2, event: "longpress" });
  });

  it("returns null for unknown state byte", () => {
    expect(parseInputReport(makeReport(1, 0xff))).toBeNull();
  });

  it("returns null for key ID 0 (out of range)", () => {
    expect(parseInputReport(makeReport(0, 0x01))).toBeNull();
  });

  it("returns null for key ID 16 (out of range)", () => {
    expect(parseInputReport(makeReport(16, 0x01))).toBeNull();
  });
});

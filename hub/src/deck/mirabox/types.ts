export interface MiraboxHardwareConfig {
  /** Display name for this hardware revision */
  name: string;
  /** USB Product ID */
  pid: number;
  /** Protocol version: 1 (original) or 3 (rev 2) */
  protocolVersion: 1 | 3;
  /** HID packet size in bytes */
  packetSize: 512 | 1024;
  /** Key image size in pixels (square) */
  keyImageSize: 85 | 95;
  /** Device reports key-up events */
  hasKeyUp: boolean;
  /** Device reports long-press natively */
  hasHardwareLongPress: boolean;
}

/** USB Vendor ID shared by all Mirabox devices */
export const MIRABOX_VID = 0x0300;

/**
 * Known hardware revisions. Indexed by PID for fast lookup.
 * Both the Ajazz AKP153E and AKP153R share the same protocol and differ
 * only in the physical key layout (E = grid, R = rotary encoders omitted here).
 */
export const HARDWARE_REVISIONS: MiraboxHardwareConfig[] = [
  {
    name: "AKP153E",
    pid: 0x1010,
    protocolVersion: 1,
    packetSize: 512,
    keyImageSize: 85,
    hasKeyUp: false,
    hasHardwareLongPress: false,
  },
  {
    name: "AKP153E v2",
    pid: 0x3010,
    protocolVersion: 3,
    packetSize: 1024,
    keyImageSize: 95,
    hasKeyUp: true,
    hasHardwareLongPress: true,
  },
  {
    name: "AKP153R",
    pid: 0x1020,
    protocolVersion: 1,
    packetSize: 512,
    keyImageSize: 85,
    hasKeyUp: false,
    hasHardwareLongPress: false,
  },
  {
    name: "AKP153R v2",
    pid: 0x3011,
    protocolVersion: 3,
    packetSize: 1024,
    keyImageSize: 95,
    hasKeyUp: true,
    hasHardwareLongPress: true,
  },
];

/** Build a PID → config lookup map for efficient device identification */
export const HARDWARE_BY_PID = new Map<number, MiraboxHardwareConfig>(
  HARDWARE_REVISIONS.map((r) => [r.pid, r]),
);

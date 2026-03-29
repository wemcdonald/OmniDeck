import { execCommand } from "./exec.js";
import { hostname as getHostname, networkInterfaces } from "node:os";

export function detectPlatform(): "darwin" | "windows" | "linux" {
  const p = process.platform;
  if (p === "darwin") return "darwin";
  if (p === "win32") return "windows";
  return "linux";
}

export function getAgentHostname(): string {
  return process.env["OMNIDECK_HOSTNAME"] ?? getHostname();
}

/** Get all non-internal MAC addresses for this machine. */
export function getMacAddresses(): string[] {
  const ifaces = networkInterfaces();
  const macs = new Set<string>();
  for (const addrs of Object.values(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (!addr.internal && addr.mac && addr.mac !== "00:00:00:00:00:00") {
        macs.add(addr.mac);
      }
    }
  }
  return Array.from(macs);
}

export interface SystemState {
  activeWindowTitle: string;
  activeWindowApp: string;
  idleTimeMs: number;
  volume: number;
  isMuted: boolean;
  micVolume: number;
  micMuted: boolean;
}

export async function pollSystemState(): Promise<SystemState> {
  const platform = detectPlatform();

  if (platform === "darwin") {
    const [activeApp, idleTime, volume, muted, micVolume] = await Promise.all([
      execCommand("osascript", [
        "-e",
        'tell application "System Events" to get name of first application process whose frontmost is true',
      ]),
      execCommand("ioreg", ["-c", "IOHIDSystem"]),
      execCommand("osascript", ["-e", "output volume of (get volume settings)"]),
      execCommand("osascript", ["-e", "output muted of (get volume settings)"]),
      execCommand("osascript", ["-e", "input volume of (get volume settings)"]),
    ]);

    let idleMs = 0;
    const idleMatch = idleTime.stdout.match(/HIDIdleTime.*?=\s*(\d+)/);
    if (idleMatch) idleMs = parseInt(idleMatch[1], 10) / 1_000_000;

    const micVol = parseFloat(micVolume.stdout.trim()) || 0;

    return {
      activeWindowTitle: "",
      activeWindowApp: activeApp.stdout.trim(),
      idleTimeMs: idleMs,
      volume: parseFloat(volume.stdout.trim()) || 0,
      isMuted: muted.stdout.trim() === "true",
      micVolume: micVol,
      micMuted: micVol === 0,
    };
  }

  // Linux/Windows: return defaults (plugins can extend)
  return {
    activeWindowTitle: "",
    activeWindowApp: "",
    idleTimeMs: 0,
    volume: 0,
    isMuted: false,
    micVolume: 0,
    micMuted: false,
  };
}

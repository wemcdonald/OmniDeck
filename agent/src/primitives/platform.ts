import { execCommand } from "./exec.js";
import { hostname as getHostname } from "node:os";

export function detectPlatform(): "darwin" | "windows" | "linux" {
  const p = process.platform;
  if (p === "darwin") return "darwin";
  if (p === "win32") return "windows";
  return "linux";
}

export function getAgentHostname(): string {
  return process.env["OMNIDECK_HOSTNAME"] ?? getHostname();
}

export interface SystemState {
  activeWindowTitle: string;
  activeWindowApp: string;
  idleTimeMs: number;
  volume: number;
  isMuted: boolean;
}

export async function pollSystemState(): Promise<SystemState> {
  const platform = detectPlatform();

  if (platform === "darwin") {
    const [activeApp, idleTime, volume, muted] = await Promise.all([
      execCommand("osascript", [
        "-e",
        'tell application "System Events" to get name of first application process whose frontmost is true',
      ]),
      execCommand("ioreg", ["-c", "IOHIDSystem"]),
      execCommand("osascript", ["-e", "output volume of (get volume settings)"]),
      execCommand("osascript", ["-e", "output muted of (get volume settings)"]),
    ]);

    let idleMs = 0;
    const idleMatch = idleTime.stdout.match(/HIDIdleTime.*?=\s*(\d+)/);
    if (idleMatch) idleMs = parseInt(idleMatch[1], 10) / 1_000_000;

    return {
      activeWindowTitle: "",
      activeWindowApp: activeApp.stdout.trim(),
      idleTimeMs: idleMs,
      volume: parseFloat(volume.stdout.trim()) || 0,
      isMuted: muted.stdout.trim() === "true",
    };
  }

  // Linux/Windows: return defaults (plugins can extend)
  return {
    activeWindowTitle: "",
    activeWindowApp: "",
    idleTimeMs: 0,
    volume: 0,
    isMuted: false,
  };
}

import { execCommand } from "./exec.js";
import { hostname as getHostname, networkInterfaces } from "node:os";

const POLL_TIMEOUT_MS = 3_000;

/** Wraps a promise so it resolves to a fallback value if it takes too long. */
function withTimeout<T>(promise: Promise<T>, fallback: T, ms = POLL_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export function detectPlatform(): "darwin" | "windows" | "linux" {
  const p = process.platform;
  if (p === "darwin") return "darwin";
  if (p === "win32") return "windows";
  return "linux";
}

export function getAgentHostname(): string {
  return process.env["OMNIDECK_HOSTNAME"] ?? getHostname().split(".")[0];
}

/** Returns a stable, network-independent device name. */
export function getDeviceName(): string {
  if (process.env["OMNIDECK_DEVICE_NAME"]) {
    return process.env["OMNIDECK_DEVICE_NAME"];
  }
  const platform = detectPlatform();
  if (platform === "darwin") {
    try {
      const result = Bun.spawnSync(["/usr/sbin/scutil", "--get", "LocalHostName"], { stdout: "pipe", stderr: "pipe" });
      if (result.exitCode === 0) {
        const name = Buffer.from(result.stdout).toString("utf8").trim();
        if (name) return name;
      }
    } catch {
      // fall through to default
    }
  }
  // Windows/Linux: strip domain suffix from OS hostname
  return getHostname().split(".")[0];
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
    const fallback = { stdout: "", stderr: "", exitCode: 1 };
    const [activeApp, idleTime, volume, muted, micVolume] = await Promise.all([
      withTimeout(execCommand("osascript", [
        "-e",
        'tell application "System Events" to get name of first application process whose frontmost is true',
      ]), fallback),
      withTimeout(execCommand("ioreg", ["-c", "IOHIDSystem"]), fallback),
      withTimeout(execCommand("osascript", ["-e", "output volume of (get volume settings)"]), fallback),
      withTimeout(execCommand("osascript", ["-e", "output muted of (get volume settings)"]), fallback),
      withTimeout(execCommand("osascript", ["-e", "input volume of (get volume settings)"]), fallback),
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

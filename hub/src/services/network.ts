import { execFile } from "node:child_process";
import { createLogger } from "../logger.js";

const log = createLogger("network");

export const SETUP_AP_CONNECTION = "omnideck-setup-ap";
export const SETUP_AP_SSID = "OmniDeck Setup";
export const SETUP_AP_IP = "192.168.50.1";

const NMCLI = "/usr/bin/nmcli";
const SUDO = "/usr/bin/sudo";

export type NetworkMode = "client" | "ap" | "connecting" | "offline" | "unavailable";

export interface NetworkState {
  mode: NetworkMode;
  ssid: string | null;
  ip: string | null;
  nmAvailable: boolean;
}

export interface WifiNetwork {
  ssid: string;
  signal: number;
  security: string;
  inUse: boolean;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Run a command with argv only (no shell). Never logs password args.
 */
function run(cmd: string, args: string[], opts: { stdin?: string; sudo?: boolean; timeoutMs?: number } = {}): Promise<ExecResult> {
  const finalCmd = opts.sudo ? SUDO : cmd;
  const finalArgs = opts.sudo ? ["-n", cmd, ...args] : args;
  return new Promise((resolve) => {
    const child = execFile(
      finalCmd,
      finalArgs,
      { timeout: opts.timeoutMs ?? 15_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: number }).code === "number" ? (err as { code: number }).code : (err ? 1 : 0);
        resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), code });
      },
    );
    if (opts.stdin && child.stdin) {
      child.stdin.end(opts.stdin);
    }
  });
}

/** Unescape nmcli `-t` (terse) colon-delimited output per-field (backslashes + colons). */
function unescapeNmField(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length) {
      out += s[i + 1];
      i++;
    } else {
      out += ch;
    }
  }
  return out;
}

function parseTerse(line: string, fieldCount: number): string[] {
  const parts: string[] = [];
  let current = "";
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      current += line[i + 1];
      i += 2;
      continue;
    }
    if (ch === ":") {
      parts.push(current);
      current = "";
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  parts.push(current);
  while (parts.length < fieldCount) parts.push("");
  return parts;
}

export async function isNmAvailable(): Promise<boolean> {
  const res = await run(NMCLI, ["-t", "general", "status"], { timeoutMs: 5000 });
  return res.code === 0;
}

export async function getState(): Promise<NetworkState> {
  if (!(await isNmAvailable())) {
    return { mode: "unavailable", ssid: null, ip: null, nmAvailable: false };
  }

  // Active connections, get name/type/device
  const active = await run(NMCLI, ["-t", "-f", "NAME,TYPE,DEVICE,STATE", "connection", "show", "--active"]);
  if (active.code !== 0) {
    return { mode: "offline", ssid: null, ip: null, nmAvailable: true };
  }

  let mode: NetworkMode = "offline";
  let ssid: string | null = null;
  let ip: string | null = null;

  for (const raw of active.stdout.split("\n").filter(Boolean)) {
    const [name, type, device] = parseTerse(raw, 4);
    if (type !== "802-11-wireless" && type !== "wifi") continue;

    if (name === SETUP_AP_CONNECTION) {
      mode = "ap";
      ssid = SETUP_AP_SSID;
      ip = SETUP_AP_IP;
      break;
    }

    mode = "client";
    // Fetch SSID from connection details
    const details = await run(NMCLI, ["-t", "-f", "802-11-wireless.ssid,IP4.ADDRESS", "connection", "show", name]);
    for (const line of details.stdout.split("\n")) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const key = line.slice(0, idx);
      const val = unescapeNmField(line.slice(idx + 1));
      if (key === "802-11-wireless.ssid") ssid = val || ssid;
      if (key.startsWith("IP4.ADDRESS")) {
        const v = val.split("/")[0];
        if (v) ip = v;
      }
    }
    if (!ip) {
      // Fallback: query device IP
      const dev = await run(NMCLI, ["-t", "-f", "IP4.ADDRESS", "device", "show", device]);
      for (const line of dev.stdout.split("\n")) {
        const idx = line.indexOf(":");
        if (idx < 0) continue;
        const val = unescapeNmField(line.slice(idx + 1));
        const v = val.split("/")[0];
        if (v) { ip = v; break; }
      }
    }
    break;
  }

  return { mode, ssid, ip, nmAvailable: true };
}

export async function isApActive(): Promise<boolean> {
  const state = await getState();
  return state.mode === "ap";
}

export async function scanWifi(): Promise<WifiNetwork[]> {
  if (!(await isNmAvailable())) return [];

  // Rescan to get fresh list; ignore errors (rescan may be rate-limited)
  await run(NMCLI, ["device", "wifi", "rescan"], { timeoutMs: 8000, sudo: true });

  const res = await run(NMCLI, ["-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list", "--rescan", "no"], { timeoutMs: 10_000 });
  if (res.code !== 0) {
    log.warn({ stderr: res.stderr }, "wifi list failed");
    return [];
  }

  const seen = new Map<string, WifiNetwork>();
  for (const raw of res.stdout.split("\n").filter(Boolean)) {
    const [inUseRaw, ssidRaw, signalRaw, securityRaw] = parseTerse(raw, 4);
    const ssid = ssidRaw;
    if (!ssid) continue;
    if (ssid === SETUP_AP_SSID) continue;
    const net: WifiNetwork = {
      ssid,
      signal: parseInt(signalRaw, 10) || 0,
      security: securityRaw || "",
      inUse: inUseRaw === "*",
    };
    const existing = seen.get(ssid);
    if (!existing || net.signal > existing.signal) seen.set(ssid, net);
  }
  return [...seen.values()].sort((a, b) => b.signal - a.signal);
}

/**
 * Connect to Wi-Fi. SSID and password are never logged.
 * Any existing profile with the same name is deleted first so a stale/wrong
 * password from a prior boot doesn't block the new credentials.
 */
export async function connectWifi(ssid: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (!ssid || ssid.length > 32) return { ok: false, error: "Invalid SSID" };
  if (password && (password.length < 8 || password.length > 63)) {
    return { ok: false, error: "Password must be 8–63 characters" };
  }

  // Remove any prior profile for this SSID. Ignore errors — profile may not exist.
  if (ssid !== SETUP_AP_CONNECTION) {
    await run(NMCLI, ["connection", "delete", ssid], { timeoutMs: 10_000, sudo: true });
  }

  const args = ["device", "wifi", "connect", ssid, "ifname", "wlan0"];
  if (password) args.push("password", password);

  const res = await run(NMCLI, args, { timeoutMs: 45_000, sudo: true });

  if (res.code !== 0) {
    const msg = (res.stderr || res.stdout).split("\n")[0] || "connect failed";
    log.warn({ code: res.code, msg }, "connectWifi failed");
    return { ok: false, error: msg };
  }

  log.info({ ssid }, "connectWifi succeeded");
  return { ok: true };
}

export async function apUp(): Promise<boolean> {
  const res = await run(NMCLI, ["connection", "up", SETUP_AP_CONNECTION], { timeoutMs: 20_000, sudo: true });
  if (res.code !== 0) log.warn({ stderr: res.stderr }, "apUp failed");
  return res.code === 0;
}

export async function apDown(): Promise<boolean> {
  const res = await run(NMCLI, ["connection", "down", SETUP_AP_CONNECTION], { timeoutMs: 20_000, sudo: true });
  return res.code === 0;
}

export async function hasInternet(): Promise<boolean> {
  const res = await run(NMCLI, ["-t", "-f", "CONNECTIVITY", "general"], { timeoutMs: 5000 });
  return /full/i.test(res.stdout);
}

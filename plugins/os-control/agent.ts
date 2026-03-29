import type { OmniDeck } from "@omnideck/agent-sdk";

export default function init(omnideck: OmniDeck) {
  // Launch an application by name
  omnideck.onAction("launch_app", async (params) => {
    const app = params.app as string;
    if (!app) return { success: false, error: "missing app param" };

    if (omnideck.platform === "darwin") {
      const result = await omnideck.exec("open", ["-a", app]);
      return { success: result.exitCode === 0, error: result.stderr || undefined };
    } else if (omnideck.platform === "windows") {
      const result = await omnideck.exec("powershell", [
        "-Command",
        `Start-Process "${app}"`,
      ]);
      return { success: result.exitCode === 0, error: result.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  // Bring an application window to the foreground
  omnideck.onAction("focus_app", async (params) => {
    const app = params.app as string;
    if (!app) return { success: false, error: "missing app param" };

    if (omnideck.platform === "darwin") {
      try {
        await omnideck.platformRequest("run_applescript", {
          script: `tell application "${app}" to activate`,
        });
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  // Send a keystroke, optionally with modifiers (e.g. keys: "cmd,shift,s")
  omnideck.onAction("send_keystroke", async (params) => {
    const keys = params.keys as string;
    if (!keys) return { success: false, error: "missing keys param" };

    if (omnideck.platform === "darwin") {
      const parsed = parseDarwinShortcut(keys);
      if (!parsed) return { success: false, error: `Unknown key in shortcut: ${keys}` };

      // Activate target app first if specified
      const targetApp = params.app as string | undefined;
      if (targetApp) {
        try {
          await omnideck.platformRequest("run_applescript", {
            script: `tell application "${targetApp}" to activate`,
          });
        } catch { /* best effort */ }
      }

      try {
        const res = await omnideck.platformRequest("send_keystroke", {
          keyCode: parsed.keyCode,
          flags: parsed.flags,
        }) as { success?: boolean; error?: string };
        return { success: res.success === true, error: res.error };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  // Set system output volume (0–100)
  omnideck.onAction("set_volume", async (params) => {
    const level = params.level as number;
    if (level === undefined || level === null)
      return { success: false, error: "missing level param" };

    if (omnideck.platform === "darwin") {
      const result = await omnideck.exec("osascript", [
        "-e",
        `set volume output volume ${level}`,
      ]);
      return { success: result.exitCode === 0, error: result.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  // Set microphone input volume (0–100)
  omnideck.onAction("set_mic_volume", async (params) => {
    const level = params.level as number;
    if (level === undefined || level === null)
      return { success: false, error: "missing level param" };

    if (omnideck.platform === "darwin") {
      const result = await omnideck.exec("osascript", [
        "-e",
        `set volume input volume ${level}`,
      ]);
      return { success: result.exitCode === 0, error: result.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  // Put the machine to sleep
  omnideck.onAction("sleep", async (_params) => {
    if (omnideck.platform === "darwin") {
      const result = await omnideck.exec("pmset", ["sleepnow"]);
      return { success: result.exitCode === 0, error: result.stderr || undefined };
    }
    if (omnideck.platform === "windows") {
      const result = await omnideck.exec("rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]);
      return { success: result.exitCode === 0, error: result.stderr || undefined };
    }
    if (omnideck.platform === "linux") {
      const result = await omnideck.exec("systemctl", ["suspend"]);
      return { success: result.exitCode === 0, error: result.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  // Lock the screen
  omnideck.onAction("lock", async (_params) => {
    if (omnideck.platform === "darwin") {
      // Ctrl+Cmd+Q locks the screen
      try {
        const res = await omnideck.platformRequest("send_keystroke", {
          keyCode: 12, // 'q'
          flags: 0x40000 | 0x100000, // kCGEventFlagMaskControl | kCGEventFlagMaskCommand
        }) as { success?: boolean; error?: string };
        return { success: res.success === true, error: res.error };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }
    if (omnideck.platform === "windows") {
      const result = await omnideck.exec("rundll32.exe", ["user32.dll,LockWorkStation"]);
      return { success: result.exitCode === 0, error: result.stderr || undefined };
    }
    if (omnideck.platform === "linux") {
      const result = await omnideck.exec("loginctl", ["lock-session"]);
      return { success: result.exitCode === 0, error: result.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  // Switch audio output device by name
  omnideck.onAction("switch_audio_output", async (params) => {
    const device = params.device as string;
    if (!device) return { success: false, error: "missing device param" };

    if (omnideck.platform === "darwin") {
      omnideck.log.warn("switch_audio_output: requires SwitchAudioSource CLI on macOS", {
        device,
      });
      const result = await omnideck.exec("SwitchAudioSource", ["-s", device]).catch(() => ({
        stdout: "",
        stderr: "SwitchAudioSource not found",
        exitCode: 1,
      }));
      return { success: result.exitCode === 0, error: result.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  // Switch audio input device by name
  omnideck.onAction("switch_audio_input", async (params) => {
    const device = params.device as string;
    if (!device) return { success: false, error: "missing device param" };

    if (omnideck.platform === "darwin") {
      omnideck.log.warn("switch_audio_input: requires SwitchAudioSource CLI on macOS", {
        device,
      });
      const result = await omnideck.exec("SwitchAudioSource", ["-t", "input", "-s", device]).catch(
        () => ({
          stdout: "",
          stderr: "SwitchAudioSource not found",
          exitCode: 1,
        }),
      );
      return { success: result.exitCode === 0, error: result.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });
}

// ---------------------------------------------------------------------------
// macOS key code helpers
// ---------------------------------------------------------------------------

const MAC_KEYCODES: Record<string, number> = {
  a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9,
  b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17, "1": 18, "2": 19,
  "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25, "7": 26, "-": 27,
  "8": 28, "0": 29, "]": 30, o: 31, u: 32, "[": 33, i: 34, p: 35,
  return: 36, l: 37, j: 38, "'": 39, k: 40, ";": 41, "\\": 42, ",": 43,
  "/": 44, n: 45, m: 46, ".": 47, tab: 9, space: 49, "`": 50,
  delete: 51, escape: 53, f1: 122, f2: 120, f3: 99, f4: 118,
  f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
  left: 123, right: 124, down: 125, up: 126,
};

const kCGEventFlagMaskShift = 0x20000;
const kCGEventFlagMaskControl = 0x40000;
const kCGEventFlagMaskAlternate = 0x80000;
const kCGEventFlagMaskCommand = 0x100000;

function parseDarwinShortcut(keys: string): { keyCode: number; flags: number } | null {
  // Accept both comma-separated ("cmd,shift,a") and array format
  const parts = (Array.isArray(keys) ? keys : keys.split(",")).map((k: string) => k.trim().toLowerCase());
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  const keyCode = MAC_KEYCODES[key];
  if (keyCode === undefined) return null;

  let flags = 0;
  for (const mod of modifiers) {
    switch (mod) {
      case "cmd": case "command": flags |= kCGEventFlagMaskCommand; break;
      case "shift": flags |= kCGEventFlagMaskShift; break;
      case "alt": case "option": flags |= kCGEventFlagMaskAlternate; break;
      case "ctrl": case "control": flags |= kCGEventFlagMaskControl; break;
    }
  }
  return { keyCode, flags };
}

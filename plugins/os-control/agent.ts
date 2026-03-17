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
      const result = await omnideck.exec("osascript", [
        "-e",
        `tell application "${app}" to activate`,
      ]);
      return { success: result.exitCode === 0, error: result.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  // Send a keystroke, optionally with modifiers (e.g. keys: "cmd,shift,s")
  omnideck.onAction("send_keystroke", async (params) => {
    const keys = params.keys as string;
    if (!keys) return { success: false, error: "missing keys param" };

    if (omnideck.platform === "darwin") {
      const parts = keys.split(",").map((k: string) => k.trim());
      const key = parts[parts.length - 1];
      const modifiers = parts.slice(0, -1);
      const modMap: Record<string, string> = {
        ctrl: "control down",
        control: "control down",
        shift: "shift down",
        alt: "option down",
        option: "option down",
        cmd: "command down",
        command: "command down",
      };
      const modStr =
        modifiers.length > 0
          ? ` using {${modifiers.map((m: string) => modMap[m] ?? m).join(", ")}}`
          : "";
      const script = `tell application "System Events" to keystroke "${key}"${modStr}`;
      const result = await omnideck.exec("osascript", ["-e", script]);
      return { success: result.exitCode === 0, error: result.stderr || undefined };
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
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  // Lock the screen (macOS: Ctrl+Cmd+Q via osascript)
  omnideck.onAction("lock", async (_params) => {
    if (omnideck.platform === "darwin") {
      const result = await omnideck.exec("osascript", [
        "-e",
        `tell application "System Events" to keystroke "q" using {control down, command down}`,
      ]);
      return { success: result.exitCode === 0, error: result.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  // Switch audio output device by name
  omnideck.onAction("switch_audio_output", async (params) => {
    const device = params.device as string;
    if (!device) return { success: false, error: "missing device param" };

    if (omnideck.platform === "darwin") {
      const script = `
        tell application "System Preferences"
          reveal pane "com.apple.preference.sound"
        end tell
      `.trim();
      // Best-effort: log the intent; full switching requires SwitchAudioSource or similar
      omnideck.log.warn("switch_audio_output: requires SwitchAudioSource CLI on macOS", {
        device,
      });
      const result = await omnideck.exec("SwitchAudioSource", ["-s", device]).catch(() => ({
        stdout: "",
        stderr: "SwitchAudioSource not found",
        exitCode: 1,
      }));
      void script;
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

import type { OmniDeck } from "@omnideck/agent-sdk";

interface AudioDevice {
  id: string;
  name: string;
  active: boolean;
}

// --- Audio device enumeration ---

async function getMacOSOutputDevices(
  exec: OmniDeck["exec"],
): Promise<AudioDevice[]> {
  try {
    const [listResult, currentResult] = await Promise.all([
      exec("SwitchAudioSource", ["-a", "-t", "output"]).catch(() => ({
        stdout: "",
        stderr: "SwitchAudioSource not found",
        exitCode: 1,
      })),
      exec("SwitchAudioSource", ["-c"]).catch(() => ({
        stdout: "",
        stderr: "SwitchAudioSource not found",
        exitCode: 1,
      })),
    ]);
    if (listResult.exitCode !== 0) return [];
    const current = currentResult.stdout.trim();
    return listResult.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((name) => ({ id: name, name, active: name === current }));
  } catch {
    return [];
  }
}

async function getMacOSInputDevices(
  exec: OmniDeck["exec"],
): Promise<AudioDevice[]> {
  try {
    const [listResult, currentResult] = await Promise.all([
      exec("SwitchAudioSource", ["-a", "-t", "input"]).catch(() => ({
        stdout: "",
        stderr: "SwitchAudioSource not found",
        exitCode: 1,
      })),
      exec("SwitchAudioSource", ["-c", "-t", "input"]).catch(() => ({
        stdout: "",
        stderr: "SwitchAudioSource not found",
        exitCode: 1,
      })),
    ]);
    if (listResult.exitCode !== 0) return [];
    const current = currentResult.stdout.trim();
    return listResult.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((name) => ({ id: name, name, active: name === current }));
  } catch {
    return [];
  }
}

async function getWindowsOutputDevices(
  exec: OmniDeck["exec"],
): Promise<AudioDevice[]> {
  try {
    const r = await exec("powershell", [
      "-Command",
      `Get-AudioDevice -List | Where-Object { $_.Type -eq "Playback" } | ForEach-Object { "$($_.Name)|$($_.Default)" }`,
    ]).catch(() => ({ stdout: "", stderr: "", exitCode: 1 }));
    if (r.exitCode !== 0) return [];
    return r.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, isDefault] = line.trim().split("|");
        const trimmedName = name?.trim() ?? "";
        return { id: trimmedName, name: trimmedName, active: isDefault?.trim() === "True" };
      });
  } catch {
    return [];
  }
}

async function getWindowsInputDevices(
  exec: OmniDeck["exec"],
): Promise<AudioDevice[]> {
  try {
    const r = await exec("powershell", [
      "-Command",
      `Get-AudioDevice -List | Where-Object { $_.Type -eq "Recording" } | ForEach-Object { "$($_.Name)|$($_.Default)" }`,
    ]).catch(() => ({ stdout: "", stderr: "", exitCode: 1 }));
    if (r.exitCode !== 0) return [];
    return r.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, isDefault] = line.trim().split("|");
        const trimmedName = name?.trim() ?? "";
        return { id: trimmedName, name: trimmedName, active: isDefault?.trim() === "True" };
      });
  } catch {
    return [];
  }
}

async function getLinuxOutputDevices(
  exec: OmniDeck["exec"],
): Promise<AudioDevice[]> {
  try {
    const [sinksResult, defaultResult] = await Promise.all([
      exec("pactl", ["list", "sinks", "short"]).catch(() => ({
        stdout: "",
        stderr: "",
        exitCode: 1,
      })),
      exec("pactl", ["get-default-sink"]).catch(() => ({
        stdout: "",
        stderr: "",
        exitCode: 1,
      })),
    ]);
    if (sinksResult.exitCode !== 0) return [];
    const defaultSink = defaultResult.stdout.trim();
    return sinksResult.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        const name = parts[1] ?? `sink-${parts[0]}`;
        return { id: name, name, active: name === defaultSink };
      });
  } catch {
    return [];
  }
}

async function getLinuxInputDevices(
  exec: OmniDeck["exec"],
): Promise<AudioDevice[]> {
  try {
    const [sourcesResult, defaultResult] = await Promise.all([
      exec("pactl", ["list", "sources", "short"]).catch(() => ({
        stdout: "",
        stderr: "",
        exitCode: 1,
      })),
      exec("pactl", ["get-default-source"]).catch(() => ({
        stdout: "",
        stderr: "",
        exitCode: 1,
      })),
    ]);
    if (sourcesResult.exitCode !== 0) return [];
    const defaultSource = defaultResult.stdout.trim();
    return sourcesResult.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.includes(".monitor"))
      .map((line) => {
        const parts = line.split(/\s+/);
        const name = parts[1] ?? `source-${parts[0]}`;
        return { id: name, name, active: name === defaultSource };
      });
  } catch {
    return [];
  }
}

export default function init(omnideck: OmniDeck) {
  // --- Helpers ---

  async function getVolume(): Promise<number> {
    if (omnideck.platform === "darwin") {
      const r = await omnideck.exec("osascript", ["-e", "output volume of (get volume settings)"]);
      return parseFloat(r.stdout.trim()) || 0;
    }
    if (omnideck.platform === "windows") {
      const r = await omnideck.exec("powershell", ["-Command",
        "[Math]::Round([Audio]::Volume * 100)"]);
      return parseFloat(r.stdout.trim()) || 0;
    }
    return 0;
  }

  async function getMuted(): Promise<boolean> {
    if (omnideck.platform === "darwin") {
      const r = await omnideck.exec("osascript", ["-e", "output muted of (get volume settings)"]);
      return r.stdout.trim() === "true";
    }
    if (omnideck.platform === "windows") {
      const r = await omnideck.exec("powershell", ["-Command", "[Audio]::Mute"]);
      return r.stdout.trim() === "True";
    }
    return false;
  }

  // --- Volume Up / Down ---

  omnideck.onAction("volume_up", async (params) => {
    const step = (params.step as number) ?? 5;

    if (omnideck.platform === "darwin") {
      const current = await getVolume();
      const next = Math.min(100, current + step);
      const r = await omnideck.exec("osascript", ["-e", `set volume output volume ${next}`]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    if (omnideck.platform === "windows") {
      // Use volume up key via PowerShell — zero dependencies
      const presses = Math.ceil(step / 2); // each key press is ~2%
      const cmd = `1..${presses} | ForEach-Object { (New-Object -ComObject WScript.Shell).SendKeys([char]175) }`;
      const r = await omnideck.exec("powershell", ["-Command", cmd]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  omnideck.onAction("volume_down", async (params) => {
    const step = (params.step as number) ?? 5;

    if (omnideck.platform === "darwin") {
      const current = await getVolume();
      const next = Math.max(0, current - step);
      const r = await omnideck.exec("osascript", ["-e", `set volume output volume ${next}`]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    if (omnideck.platform === "windows") {
      const presses = Math.ceil(step / 2);
      const cmd = `1..${presses} | ForEach-Object { (New-Object -ComObject WScript.Shell).SendKeys([char]174) }`;
      const r = await omnideck.exec("powershell", ["-Command", cmd]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  // --- Mute / Unmute / Toggle ---

  omnideck.onAction("mute", async () => {
    if (omnideck.platform === "darwin") {
      const r = await omnideck.exec("osascript", ["-e", "set volume with output muted"]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    if (omnideck.platform === "windows") {
      const muted = await getMuted();
      if (!muted) {
        const r = await omnideck.exec("powershell", ["-Command",
          "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"]);
        return { success: r.exitCode === 0, error: r.stderr || undefined };
      }
      return { success: true };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  omnideck.onAction("unmute", async () => {
    if (omnideck.platform === "darwin") {
      const r = await omnideck.exec("osascript", ["-e", "set volume without output muted"]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    if (omnideck.platform === "windows") {
      const muted = await getMuted();
      if (muted) {
        const r = await omnideck.exec("powershell", ["-Command",
          "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"]);
        return { success: r.exitCode === 0, error: r.stderr || undefined };
      }
      return { success: true };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  omnideck.onAction("toggle_mute", async () => {
    if (omnideck.platform === "darwin") {
      const muted = await getMuted();
      const script = muted
        ? "set volume without output muted"
        : "set volume with output muted";
      const r = await omnideck.exec("osascript", ["-e", script]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    if (omnideck.platform === "windows") {
      // VK_VOLUME_MUTE toggles
      const r = await omnideck.exec("powershell", ["-Command",
        "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  // --- Mic Mute / Unmute / Toggle ---
  // macOS has no native mic mute — we set input volume to 0 and restore

  let savedMicVolume = 100;

  omnideck.onAction("mic_mute", async () => {
    if (omnideck.platform === "darwin") {
      const cur = await omnideck.exec("osascript", ["-e", "input volume of (get volume settings)"]);
      const curVol = parseFloat(cur.stdout.trim()) || 100;
      if (curVol > 0) savedMicVolume = curVol;
      const r = await omnideck.exec("osascript", ["-e", "set volume input volume 0"]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    if (omnideck.platform === "windows") {
      const r = await omnideck.exec("powershell", ["-Command",
        "Get-AudioDevice -RecordingDefault | Set-AudioDevice -RecordingMute 1"]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  omnideck.onAction("mic_unmute", async () => {
    if (omnideck.platform === "darwin") {
      const r = await omnideck.exec("osascript", ["-e", `set volume input volume ${savedMicVolume}`]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    if (omnideck.platform === "windows") {
      const r = await omnideck.exec("powershell", ["-Command",
        "Get-AudioDevice -RecordingDefault | Set-AudioDevice -RecordingMute 0"]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  omnideck.onAction("toggle_mic_mute", async () => {
    if (omnideck.platform === "darwin") {
      const cur = await omnideck.exec("osascript", ["-e", "input volume of (get volume settings)"]);
      const curVol = parseFloat(cur.stdout.trim()) || 0;
      if (curVol > 0) {
        savedMicVolume = curVol;
        const r = await omnideck.exec("osascript", ["-e", "set volume input volume 0"]);
        return { success: r.exitCode === 0, error: r.stderr || undefined };
      } else {
        const r = await omnideck.exec("osascript", ["-e", `set volume input volume ${savedMicVolume}`]);
        return { success: r.exitCode === 0, error: r.stderr || undefined };
      }
    }
    if (omnideck.platform === "windows") {
      const r = await omnideck.exec("powershell", ["-Command",
        "$dev = Get-AudioDevice -RecordingDefault; if ($dev.Mute) { Set-AudioDevice -RecordingMute 0 } else { Set-AudioDevice -RecordingMute 1 }"]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  // --- Media Keys ---
  // macOS: MediaRemote.framework via FFI (same API as Control Center)
  // Linux: playerctl
  // Windows: PowerShell SendKeys

  // MRMediaRemoteCommand: togglePlayPause=2, nextTrack=4, previousTrack=5
  const MR_PLAY_PAUSE = 2, MR_NEXT = 4, MR_PREVIOUS = 5;

  let mrLib: { call(name: string, ...args: unknown[]): unknown } | undefined;
  if (omnideck.platform === "darwin") {
    try {
      mrLib = omnideck.ffi.open(
        "/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote",
        { MRMediaRemoteSendCommand: { args: ["i32", "ptr"], returns: "bool" } },
      );
    } catch (err) {
      omnideck.log.warn("MediaRemote FFI not available, media keys disabled", { err: String(err) });
    }
  }

  async function handleMediaKey(darwinCmd: number, linuxArg: string, windowsVk: number) {
    if (omnideck.platform === "darwin") {
      if (!mrLib) return { success: false, error: "MediaRemote not available" };
      mrLib.call("MRMediaRemoteSendCommand", darwinCmd, null);
      return { success: true };
    }
    if (omnideck.platform === "linux") {
      const r = await omnideck.exec("playerctl", [linuxArg]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    if (omnideck.platform === "windows") {
      const r = await omnideck.exec("powershell", ["-Command",
        `(New-Object -ComObject WScript.Shell).SendKeys([char]${windowsVk})`]);
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  }

  omnideck.onAction("media_play_pause", () => handleMediaKey(MR_PLAY_PAUSE, "play-pause", 179));
  omnideck.onAction("media_next", () => handleMediaKey(MR_NEXT, "next", 176));
  omnideck.onAction("media_previous", () => handleMediaKey(MR_PREVIOUS, "previous", 177));

  // --- Audio Device State Polling ---

  async function pollAudioDevices() {
    try {
      let outputDevices: AudioDevice[] = [];
      let inputDevices: AudioDevice[] = [];

      if (omnideck.platform === "darwin") {
        [outputDevices, inputDevices] = await Promise.all([
          getMacOSOutputDevices(omnideck.exec.bind(omnideck)),
          getMacOSInputDevices(omnideck.exec.bind(omnideck)),
        ]);
      } else if (omnideck.platform === "windows") {
        [outputDevices, inputDevices] = await Promise.all([
          getWindowsOutputDevices(omnideck.exec.bind(omnideck)),
          getWindowsInputDevices(omnideck.exec.bind(omnideck)),
        ]);
      } else if (omnideck.platform === "linux") {
        [outputDevices, inputDevices] = await Promise.all([
          getLinuxOutputDevices(omnideck.exec.bind(omnideck)),
          getLinuxInputDevices(omnideck.exec.bind(omnideck)),
        ]);
      }

      omnideck.setState("audio_output_devices", outputDevices);
      omnideck.setState("audio_input_devices", inputDevices);
    } catch (err) {
      omnideck.log.error("Audio device poll failed", { err: String(err) });
    }
  }

  // Poll immediately then every 10s
  pollAudioDevices();
  omnideck.setInterval(pollAudioDevices, 10_000);

  // --- Device Switching ---

  omnideck.onAction("change_output_device", async (params) => {
    const device = params.device as string;
    if (!device) return { success: false, error: "missing device param" };

    if (omnideck.platform === "darwin") {
      const r = await omnideck.exec("SwitchAudioSource", ["-s", device]).catch(() => ({
        stdout: "", stderr: "SwitchAudioSource not installed (brew install switchaudio-osx)", exitCode: 1,
      }));
      if (r.exitCode === 0) pollAudioDevices();
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    if (omnideck.platform === "windows") {
      const r = await omnideck.exec("powershell", ["-Command",
        `Get-AudioDevice -List | Where-Object { $_.Name -like "*${device}*" -and $_.Type -eq "Playback" } | Set-AudioDevice`]);
      if (r.exitCode === 0) pollAudioDevices();
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    if (omnideck.platform === "linux") {
      const r = await omnideck.exec("pactl", ["set-default-sink", device]);
      if (r.exitCode === 0) pollAudioDevices();
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });

  omnideck.onAction("change_input_device", async (params) => {
    const device = params.device as string;
    if (!device) return { success: false, error: "missing device param" };

    if (omnideck.platform === "darwin") {
      const r = await omnideck.exec("SwitchAudioSource", ["-t", "input", "-s", device]).catch(() => ({
        stdout: "", stderr: "SwitchAudioSource not installed (brew install switchaudio-osx)", exitCode: 1,
      }));
      if (r.exitCode === 0) pollAudioDevices();
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    if (omnideck.platform === "windows") {
      const r = await omnideck.exec("powershell", ["-Command",
        `Get-AudioDevice -List | Where-Object { $_.Name -like "*${device}*" -and $_.Type -eq "Recording" } | Set-AudioDevice`]);
      if (r.exitCode === 0) pollAudioDevices();
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    if (omnideck.platform === "linux") {
      const r = await omnideck.exec("pactl", ["set-default-source", device]);
      if (r.exitCode === 0) pollAudioDevices();
      return { success: r.exitCode === 0, error: r.stderr || undefined };
    }
    return { success: false, error: `Unsupported platform: ${omnideck.platform}` };
  });
}

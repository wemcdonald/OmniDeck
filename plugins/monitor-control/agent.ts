import type { OmniDeck } from "@omnideck/agent-sdk";

const DEFAULT_INPUT_NAMES: Record<number, string> = {
  1: "VGA-1", 2: "VGA-2",
  3: "DVI-1", 4: "DVI-2",
  15: "DP-1", 16: "DP-2",
  17: "HDMI-1", 18: "HDMI-2",
  27: "USB-C",
};

interface MonitorInfo {
  id: string;
  name: string;
  currentInput: number;
  currentInputName: string;
  inputs: Array<{ value: number; name: string }>;
}

export default function init(omnideck: OmniDeck) {
  const platform = omnideck.platform;

  // --- Platform-specific DDC/CI implementations ---

  async function detectMonitorsDarwin(): Promise<MonitorInfo[]> {
    const list = await omnideck.exec("m1ddc", ["display", "list"]);
    if (list.exitCode !== 0) return [];

    const monitors: MonitorInfo[] = [];
    // m1ddc display list outputs lines like: "[1] ROG XG27UQ (UUID)"
    const lines = list.stdout.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      const match = line.match(/^\[(\d+)\]\s+(.+?)\s+\(/);
      if (!match) continue;
      const id = match[1];
      const name = match[2].trim();

      // Get current input for this display
      const input = await omnideck.exec("m1ddc", ["display", id, "get", "input"]);
      const currentInput = parseInt(input.stdout.trim(), 10) || 0;

      monitors.push({
        id,
        name,
        currentInput,
        currentInputName: DEFAULT_INPUT_NAMES[currentInput] ?? `Input ${currentInput}`,
        inputs: [],
      });
    }
    return monitors;
  }

  // PowerShell script for Windows DDC/CI via dxva2.dll
  const WIN_DDC_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public class DDC {
    [DllImport("dxva2.dll")]
    static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, out uint count);
    [DllImport("dxva2.dll")]
    static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, uint count, [Out] PHYSICAL_MONITOR[] monitors);
    [DllImport("dxva2.dll")]
    static extern bool GetVCPFeatureAndVCPFeatureReply(IntPtr hMonitor, byte code, out uint pvct, out uint current, out uint maximum);
    [DllImport("dxva2.dll")]
    static extern bool SetVCPFeature(IntPtr hMonitor, byte code, uint value);
    [DllImport("dxva2.dll")]
    static extern bool DestroyPhysicalMonitor(IntPtr hMonitor);
    [DllImport("user32.dll")]
    static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumDelegate lpfnEnum, IntPtr dwData);

    delegate bool MonitorEnumDelegate(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct PHYSICAL_MONITOR { public IntPtr hPhysicalMonitor; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szPhysicalMonitorDescription; }

    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int left, top, right, bottom; }

    public struct MonitorResult { public IntPtr Handle; public string Name; public uint CurrentInput; }

    public static List<MonitorResult> GetMonitors() {
        var results = new List<MonitorResult>();
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMon, IntPtr hdc, ref RECT rect, IntPtr data) => {
            uint count = 0;
            if (GetNumberOfPhysicalMonitorsFromHMONITOR(hMon, out count) && count > 0) {
                var physMons = new PHYSICAL_MONITOR[count];
                if (GetPhysicalMonitorsFromHMONITOR(hMon, count, physMons)) {
                    foreach (var pm in physMons) {
                        uint pvct, current, max;
                        GetVCPFeatureAndVCPFeatureReply(pm.hPhysicalMonitor, 0x60, out pvct, out current, out max);
                        results.Add(new MonitorResult { Handle = pm.hPhysicalMonitor, Name = pm.szPhysicalMonitorDescription, CurrentInput = current });
                    }
                }
            }
            return true;
        }, IntPtr.Zero);
        return results;
    }

    public static bool SetInput(int monitorIndex, uint inputValue) {
        var monitors = GetMonitors();
        if (monitorIndex < 0 || monitorIndex >= monitors.Count) return false;
        return SetVCPFeature(monitors[monitorIndex].Handle, 0x60, inputValue);
    }
}
"@
`;

  async function detectMonitorsWindows(): Promise<MonitorInfo[]> {
    const r = await omnideck.exec("powershell", ["-Command",
      `${WIN_DDC_SCRIPT}
[DDC]::GetMonitors() | ForEach-Object { "$($_.Name)|$($_.CurrentInput)" }`]);
    if (r.exitCode !== 0) return [];

    return r.stdout.trim().split("\n").filter(Boolean).map((line, i) => {
      const [name, inputStr] = line.split("|");
      const currentInput = parseInt(inputStr, 10) || 0;
      return {
        id: String(i),
        name: name?.trim() ?? `Monitor ${i + 1}`,
        currentInput,
        currentInputName: DEFAULT_INPUT_NAMES[currentInput] ?? `Input ${currentInput}`,
        inputs: [],
      };
    });
  }

  async function detectMonitorsLinux(): Promise<MonitorInfo[]> {
    const detect = await omnideck.exec("ddcutil", ["detect", "--brief"]);
    if (detect.exitCode !== 0) return [];

    const monitors: MonitorInfo[] = [];
    // Parse ddcutil detect --brief output for bus numbers
    const busMatches = detect.stdout.matchAll(/I2C bus:\s+\/dev\/i2c-(\d+)/g);

    for (const match of busMatches) {
      const bus = match[1];
      // Get model name
      const model = await omnideck.exec("ddcutil", ["--bus", bus, "getvcp", "0x60"]);
      const valMatch = model.stdout.match(/current value\s*=\s*(\d+)/i);
      const currentInput = valMatch ? parseInt(valMatch[1], 10) : 0;

      // Try to get monitor name from detect output
      const nameMatch = detect.stdout.match(new RegExp(`i2c-${bus}[\\s\\S]*?Monitor:\\s+(.+?)\\n`));
      const name = nameMatch?.[1]?.trim() ?? `Monitor (bus ${bus})`;

      monitors.push({
        id: bus,
        name,
        currentInput,
        currentInputName: DEFAULT_INPUT_NAMES[currentInput] ?? `Input ${currentInput}`,
        inputs: [],
      });
    }
    return monitors;
  }

  async function detectMonitors(): Promise<MonitorInfo[]> {
    if (platform === "darwin") return detectMonitorsDarwin();
    if (platform === "windows") return detectMonitorsWindows();
    if (platform === "linux") return detectMonitorsLinux();
    return [];
  }

  async function setInputDarwin(monitorId: string, input: number): Promise<boolean> {
    const r = await omnideck.exec("m1ddc", ["display", monitorId, "set", "input", String(input)]);
    return r.exitCode === 0;
  }

  async function setInputWindows(monitorId: string, input: number): Promise<boolean> {
    const r = await omnideck.exec("powershell", ["-Command",
      `${WIN_DDC_SCRIPT}
[DDC]::SetInput(${monitorId}, ${input})`]);
    return r.exitCode === 0 && r.stdout.trim() === "True";
  }

  async function setInputLinux(monitorId: string, input: number): Promise<boolean> {
    const r = await omnideck.exec("ddcutil", ["--bus", monitorId, "setvcp", "0x60", String(input), "--noverify"]);
    return r.exitCode === 0;
  }

  async function setInput(monitorId: string, input: number): Promise<boolean> {
    if (platform === "darwin") return setInputDarwin(monitorId, input);
    if (platform === "windows") return setInputWindows(monitorId, input);
    if (platform === "linux") return setInputLinux(monitorId, input);
    return false;
  }

  // --- Check tool availability on init ---

  if (platform === "darwin") {
    omnideck.exec("which", ["m1ddc"]).then((r) => {
      if (r.exitCode !== 0) {
        omnideck.log.warn("m1ddc not found. Install with: brew install m1ddc");
      }
    });
  } else if (platform === "linux") {
    omnideck.exec("which", ["ddcutil"]).then((r) => {
      if (r.exitCode !== 0) {
        omnideck.log.warn(
          "ddcutil not found. Install with: sudo apt install ddcutil i2c-tools && sudo usermod -aG i2c $USER && sudo modprobe i2c-dev",
        );
      }
    });
  }

  // --- Poll and report monitor state ---

  let lastMonitors: MonitorInfo[] = [];

  async function pollMonitors() {
    try {
      lastMonitors = await detectMonitors();
      omnideck.setState("monitors", lastMonitors);
    } catch (err) {
      omnideck.log.error("Monitor poll failed", { err: String(err) });
    }
  }

  // Poll immediately then every 10s
  pollMonitors();
  omnideck.setInterval(pollMonitors, 10_000);

  // --- Actions ---

  /** Find a monitor by name substring match, ID, or fall back to first. */
  function findMonitor(params: Record<string, unknown>): MonitorInfo | undefined {
    const monitorParam = params.monitor as string | undefined;
    if (!monitorParam) return lastMonitors[0];
    // Try exact ID match first
    const byId = lastMonitors.find((m) => m.id === monitorParam);
    if (byId) return byId;
    // Then case-insensitive name substring match
    const lower = monitorParam.toLowerCase();
    return lastMonitors.find((m) => m.name.toLowerCase().includes(lower)) ?? lastMonitors[0];
  }

  omnideck.onAction("set_input", async (params) => {
    const mon = findMonitor(params);
    const input = params.input as number;
    if (!mon) return { success: false, error: "No monitor detected" };
    if (input === undefined) return { success: false, error: "Missing input parameter" };

    const ok = await setInput(mon.id, input);
    if (ok) {
      mon.currentInput = input;
      mon.currentInputName = DEFAULT_INPUT_NAMES[input] ?? `Input ${input}`;
      omnideck.setState("monitors", lastMonitors);
    }
    return { success: ok, error: ok ? undefined : "Failed to set monitor input" };
  });

  omnideck.onAction("next_input", async (params) => {
    const mon = findMonitor(params);
    if (!mon) return { success: false, error: "No monitor detected" };

    // Get available inputs from params or use common defaults
    const configInputs = params.inputs as Record<string, unknown> | undefined;
    let inputValues: number[];
    if (configInputs) {
      inputValues = Object.keys(configInputs).map(Number).sort((a, b) => a - b);
    } else if (mon.inputs.length > 0) {
      inputValues = mon.inputs.map((i) => i.value);
    } else {
      // Fallback: cycle through standard inputs
      inputValues = [15, 17]; // DP-1, HDMI-1
    }

    const currentIdx = inputValues.indexOf(mon.currentInput);
    const nextInput = inputValues[(currentIdx + 1) % inputValues.length];

    const ok = await setInput(mon.id, nextInput);
    if (ok) {
      mon.currentInput = nextInput;
      mon.currentInputName = DEFAULT_INPUT_NAMES[nextInput] ?? `Input ${nextInput}`;
      omnideck.setState("monitors", lastMonitors);
    }
    return { success: ok, error: ok ? undefined : "Failed to switch monitor input" };
  });
}

import { z } from "zod";
import { createSocket } from "node:dgram";
import { field } from "@omnideck/plugin-schema";
import type { OmniDeckPlugin, PluginContext } from "../../types.js";

interface OsControlConfig {
  default_target: string;
}

const targetParam = {
  target: field(z.string().optional(), { label: "Target", fieldType: "agent" as const }),
};

const extraFields: Record<string, Record<string, z.ZodType>> = {
  launch_app: { app: field(z.string(), { label: "App Name" }) },
  focus_app: { app: field(z.string(), { label: "App Name" }) },
  send_keystroke: { keys: field(z.array(z.string()), { label: "Keys" }) },
  set_volume: { level: field(z.number().min(0).max(100), { label: "Volume" }) },
  set_mic_volume: { level: field(z.number().min(0).max(100), { label: "Volume" }) },
};

const actionDescriptions: Record<string, { description: string; icon: string }> = {
  launch_app: { description: "Launch an application", icon: "ms:launch" },
  focus_app: { description: "Focus an application window", icon: "ms:open-in-new" },
  send_keystroke: { description: "Send a keyboard shortcut", icon: "ms:keyboard" },
  set_volume: { description: "Set system volume", icon: "ms:volume-up" },
  set_mic_volume: { description: "Set microphone volume", icon: "ms:mic" },
  sleep: { description: "Put the system to sleep", icon: "ms:bedtime" },
  lock: { description: "Lock the screen", icon: "ms:lock" },
  switch_audio_output: { description: "Switch audio output device", icon: "ms:speaker" },
  switch_audio_input: { description: "Switch audio input device", icon: "ms:mic-external-on" },
};

const targetOnlySchema = z.object(targetParam);

const configSchema = z.object({
  default_target: field(z.string().optional(), { label: "Default Agent", fieldType: "agent" as const }),
});

export const osControlPlugin: OmniDeckPlugin = {
  id: "os-control",
  configSchema,
  name: "OS Control",
  version: "1.0.0",
  icon: "ms:computer",

  async init(ctx: PluginContext) {
    const config = ctx.config as OsControlConfig;

    const agentActions = [
      "launch_app",
      "focus_app",
      "send_keystroke",
      "set_volume",
      "set_mic_volume",
      "sleep",
      "lock",
      "switch_audio_output",
      "switch_audio_input",
    ] as const;

    for (const actionId of agentActions) {
      const extra = extraFields[actionId];
      const schema = extra
        ? z.object({ ...extra, ...targetParam })
        : targetOnlySchema;
      const meta = actionDescriptions[actionId];

      ctx.registerAction({
        id: actionId,
        name: actionId.replace(/_/g, " "),
        description: meta.description,
        icon: meta.icon,
        paramsSchema: schema,
        async execute(params, actionCtx) {
          const p = params as Record<string, unknown>;
          const target =
            (p.target as string | undefined) ??
            actionCtx.focusedAgent ??
            config.default_target;
          ctx.state.set("os-control", `pending:${target}:${actionId}`, {
            params,
            timestamp: Date.now(),
          });
        },
      });
    }

    // -- Wake-on-LAN (runs on hub, not agent — target machine is asleep) --
    // Can specify a target agent (looks up MAC from last state_update) or an explicit MAC.
    const wolSchema = z.object({
      target: field(z.string().optional(), { label: "Target", fieldType: "agent" as const }),
      mac: field(z.string().optional(), { label: "MAC Address", placeholder: "AA:BB:CC:DD:EE:FF" }),
      broadcast: field(z.string().optional(), { label: "Broadcast IP", placeholder: "255.255.255.255" }),
    });

    ctx.registerAction({
      id: "wake_on_lan",
      name: "Wake on LAN",
      description: "Send a Wake-on-LAN magic packet to power on a machine",
      icon: "ms:power-settings-new",
      paramsSchema: wolSchema,
      async execute(params, actionCtx) {
        const { target, mac, broadcast } = wolSchema.parse(params);

        // Resolve MAC: explicit param, or look up from agent's last reported state
        let resolvedMac = mac;
        if (!resolvedMac) {
          const agentTarget = target ?? actionCtx.focusedAgent ?? config.default_target;
          const agentState = ctx.state.get("os-control", `agent:${agentTarget}:state`) as
            Record<string, unknown> | undefined;
          const macs = agentState?.mac_addresses as string[] | undefined;
          if (macs && macs.length > 0) resolvedMac = macs[0];
        }
        if (!resolvedMac) throw new Error("No MAC address — agent has not reported one yet");

        const macBytes = resolvedMac.replace(/[:-]/g, "").match(/.{2}/g);
        if (!macBytes || macBytes.length !== 6) throw new Error(`Invalid MAC: ${resolvedMac}`);
        const macBuf = Buffer.from(macBytes.map((b) => parseInt(b, 16)));
        const payload = Buffer.alloc(102);
        for (let i = 0; i < 6; i++) payload[i] = 0xff;
        for (let i = 0; i < 16; i++) macBuf.copy(payload, 6 + i * 6);

        await new Promise<void>((resolve, reject) => {
          const sock = createSocket("udp4");
          sock.once("error", (err) => { sock.close(); reject(err); });
          sock.bind(() => {
            sock.setBroadcast(true);
            sock.send(payload, 0, payload.length, 9, broadcast ?? "255.255.255.255", (err) => {
              sock.close();
              if (err) reject(err); else resolve();
            });
          });
        });
      },
    });

    // -- Presets --

    ctx.registerPreset({
      id: "sleep",
      name: "Sleep",
      description: "Put a machine to sleep",
      action: "sleep",
      defaults: { icon: "ms:bedtime" },
    });

    ctx.registerPreset({
      id: "lock",
      name: "Lock Screen",
      description: "Lock a machine's screen",
      action: "lock",
      defaults: { icon: "ms:lock" },
    });

    ctx.registerPreset({
      id: "wake_on_lan",
      name: "Wake on LAN",
      description: "Power on a machine via WoL magic packet",
      action: "wake_on_lan",
      defaults: { icon: "ms:power-settings-new" },
    });

    ctx.registerStateProvider({
      id: "active_window",
      name: "Active Window",
      description: "Currently focused window title",
      paramsSchema: targetOnlySchema,
      resolve(params) {
        const p = params as Record<string, unknown>;
        const target = (p.target as string | undefined) ?? config.default_target;
        const agentState = ctx.state.get(
          "os-control",
          `agent:${target}:state`,
        ) as Record<string, unknown> | undefined;
        const title = (agentState?.active_window_title as string) ?? "";
        return { state: { label: title }, variables: {} };
      },
    });

    ctx.registerStateProvider({
      id: "volume_level",
      name: "Volume Level",
      description: "System volume with percentage and progress bar",
      paramsSchema: targetOnlySchema,
      resolve(params) {
        const p = params as Record<string, unknown>;
        const target = (p.target as string | undefined) ?? config.default_target;
        const agentState = ctx.state.get(
          "os-control",
          `agent:${target}:state`,
        ) as Record<string, unknown> | undefined;
        const volume = (agentState?.volume as number) ?? 0;
        return {
          state: {
            label: `${Math.round(volume)}%`,
            progress: volume / 100,
          },
          variables: {},
        };
      },
    });

    ctx.registerStateProvider({
      id: "app_running",
      name: "App Running",
      description: "Dims button when the specified app is not the active window",
      paramsSchema: targetOnlySchema,
      resolve(params) {
        const p = params as Record<string, unknown>;
        const target = (p.target as string | undefined) ?? config.default_target;
        const app = p.app as string | undefined;
        const agentState = ctx.state.get(
          "os-control",
          `agent:${target}:state`,
        ) as Record<string, unknown> | undefined;
        const activeApp = agentState?.active_window_app as string | undefined;
        const isRunning =
          activeApp !== undefined &&
          app !== undefined &&
          activeApp.toLowerCase() === app.toLowerCase();
        return isRunning
          ? { state: {}, variables: {} }
          : { state: { opacity: 0.5 }, variables: {} };
      },
    });

    ctx.registerPreset({
      id: "app_launcher",
      name: "App Launcher",
      description: "Launch an application on a target machine",
      category: "System",
      action: "launch_app",
      defaults: {
        icon: "ms:launch",
      },
    });

    ctx.setHealth({ status: "ok" });
  },

  async destroy() {},
};

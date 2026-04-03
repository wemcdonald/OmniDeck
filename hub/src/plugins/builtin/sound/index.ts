import { z } from "zod";
import { field } from "@omnideck/plugin-schema";
import type { OmniDeckPlugin, PluginContext } from "../../types.js";
import { resolveTarget as centralResolveTarget } from "../../../orchestrator/resolver.js";
import { soundPresets } from "./presets.js";

interface AudioDevice {
  id: string;
  name: string;
  active: boolean;
}

interface SoundConfig {
  default_target?: string;
  default_step?: number;
  agent_order?: string[];
  device_filter?: {
    output?: string[];
    input?: string[];
  };
}

const targetSchema = z.object({
  target: field(z.string().optional(), { label: "Target", fieldType: "agent" }),
});

const volumeStepSchema = z.object({
  step: field(z.number().optional(), { label: "Step" }),
  target: field(z.string().optional(), { label: "Target", fieldType: "agent" }),
});

const deviceSchema = z.object({
  device: field(z.string(), { label: "Device" }),
  target: field(z.string().optional(), { label: "Target", fieldType: "agent" }),
});

const simpleActionMeta: Record<string, { description: string; icon: string }> = {
  mute: { description: "Mute audio", icon: "ms:volume-off" },
  unmute: { description: "Unmute audio", icon: "ms:volume-off" },
  toggle_mute: { description: "Toggle audio mute", icon: "ms:volume-up" },
  mic_mute: { description: "Mute microphone", icon: "ms:mic-off" },
  mic_unmute: { description: "Unmute microphone", icon: "ms:mic-off" },
  toggle_mic_mute: { description: "Toggle microphone mute", icon: "ms:mic" },
  media_play_pause: { description: "Toggle media playback", icon: "ms:play-pause" },
  media_next: { description: "Next track", icon: "ms:skip-next" },
  media_previous: { description: "Previous track", icon: "ms:skip-previous" },
};

const deviceFilterSchema = z.object({
  output: z.array(z.string()).optional(),
  input: z.array(z.string()).optional(),
}).optional();

const configSchema = z.object({
  default_target: field(z.string().optional(), { label: "Default Agent", fieldType: "agent" as const }),
  default_step: field(z.number().default(10).optional(), { label: "Volume Step (%)" }),
  device_filter: field(deviceFilterSchema, { label: "Device Filter" }),
});

export const soundPlugin: OmniDeckPlugin = {
  id: "sound",
  configSchema,
  name: "Sound",
  version: "1.0.0",
  icon: "ms:volume-up",

  async init(ctx: PluginContext) {
    const config = ctx.config as SoundConfig;
    const defaultStep = config.default_step ?? 10;

    function resolveTarget(params: unknown, actionCtx: { focusedAgent?: string; targetAgent?: string }) {
      const p = params as Record<string, unknown>;
      const explicitTarget = (p.target as string | undefined) ?? actionCtx.targetAgent;
      const connectedRaw = ctx.state.get("orchestrator", "connected_agents") as string[] | undefined;
      const connectedAgents = new Set(connectedRaw ?? []);
      return centralResolveTarget({
        pluginId: "sound",
        explicitTarget,
        state: ctx.state,
        config: { agent_order: config.agent_order },
        connectedAgents,
      }) ?? actionCtx.focusedAgent ?? config.default_target;
    }

    function getAgentState(target: string | undefined) {
      if (!target) return undefined;
      return ctx.state.get("os-control", `agent:${target}:state`) as
        | Record<string, unknown>
        | undefined;
    }

    function getOutputDevices(target: string | undefined): AudioDevice[] {
      if (!target) return [];
      const devices = ctx.state.get("sound", `agent:${target}:audio_output_devices`) as AudioDevice[] | undefined;
      return devices ?? [];
    }

    function getInputDevices(target: string | undefined): AudioDevice[] {
      if (!target) return [];
      const devices = ctx.state.get("sound", `agent:${target}:audio_input_devices`) as AudioDevice[] | undefined;
      return devices ?? [];
    }

    function applyDeviceFilter(devices: AudioDevice[], filter: string[] | undefined): AudioDevice[] {
      if (!filter || filter.length === 0) return devices;
      const filterLower = filter.map((f) => f.toLowerCase());
      return devices.filter((d) => filterLower.some((f) => d.name.toLowerCase().includes(f)));
    }

    // --- Actions ---
    // All actions dispatch to the agent via the pending: state convention

    const simpleActions = [
      "mute",
      "unmute",
      "toggle_mute",
      "mic_mute",
      "mic_unmute",
      "toggle_mic_mute",
      "media_play_pause",
      "media_next",
      "media_previous",
    ] as const;

    for (const actionId of simpleActions) {
      const meta = simpleActionMeta[actionId];
      ctx.registerAction({
        id: actionId,
        name: actionId.replace(/_/g, " "),
        description: meta.description,
        icon: meta.icon,
        paramsSchema: targetSchema,
        async execute(params, actionCtx) {
          const target = resolveTarget(params, actionCtx);
          ctx.state.set("sound", `pending:${target}:${actionId}`, {
            params: {},
            timestamp: Date.now(),
          });
        },
      });
    }

    ctx.registerAction({
      id: "volume_up",
      name: "Volume Up",
      description: "Increase volume",
      icon: "ms:volume-up",
      paramsSchema: volumeStepSchema,
      async execute(params, actionCtx) {
        const p = volumeStepSchema.parse(params);
        const step = p.step ?? defaultStep;
        const target = resolveTarget(params, actionCtx);
        ctx.state.set("sound", `pending:${target}:volume_up`, {
          params: { step },
          timestamp: Date.now(),
        });
      },
    });

    ctx.registerAction({
      id: "volume_down",
      name: "Volume Down",
      description: "Decrease volume",
      icon: "ms:volume-down",
      paramsSchema: volumeStepSchema,
      async execute(params, actionCtx) {
        const p = volumeStepSchema.parse(params);
        const step = p.step ?? defaultStep;
        const target = resolveTarget(params, actionCtx);
        ctx.state.set("sound", `pending:${target}:volume_down`, {
          params: { step },
          timestamp: Date.now(),
        });
      },
    });

    ctx.registerAction({
      id: "change_output_device",
      name: "Change Output Device",
      description: "Change audio output device",
      icon: "ms:speaker",
      paramsSchema: deviceSchema,
      async execute(params, actionCtx) {
        const p = params as Record<string, unknown>;
        const target = resolveTarget(params, actionCtx);
        ctx.state.set("sound", `pending:${target}:change_output_device`, {
          params: { device: p.device },
          timestamp: Date.now(),
        });
      },
    });

    ctx.registerAction({
      id: "change_input_device",
      name: "Change Input Device",
      description: "Change audio input device",
      icon: "ms:mic-external-on",
      paramsSchema: deviceSchema,
      async execute(params, actionCtx) {
        const p = params as Record<string, unknown>;
        const target = resolveTarget(params, actionCtx);
        ctx.state.set("sound", `pending:${target}:change_input_device`, {
          params: { device: p.device },
          timestamp: Date.now(),
        });
      },
    });

    ctx.registerAction({
      id: "open_output_devices",
      name: "Output Devices",
      description: "Open audio output device selection page",
      icon: "ms:speaker",
      paramsSchema: targetSchema,
      async execute() {
        ctx.state.set("omnideck-core", "current_page", "sound.output_devices");
      },
    });

    ctx.registerAction({
      id: "open_input_devices",
      name: "Input Devices",
      description: "Open audio input device selection page",
      icon: "ms:mic-external-on",
      paramsSchema: targetSchema,
      async execute() {
        ctx.state.set("omnideck-core", "current_page", "sound.input_devices");
      },
    });

    // --- State Providers ---

    ctx.registerStateProvider({
      id: "volume_level",
      name: "Volume Level",
      description: "Current volume with percentage and progress bar",
      icon: "ms:volume-up",
      providesIcon: true,
      paramsSchema: targetSchema,
      resolve(params) {
        const p = params as Record<string, unknown>;
        const target = (p.target as string | undefined) ?? config.default_target;
        const agentState = getAgentState(target);
        const volume = (agentState?.volume as number) ?? 0;
        let icon = "ms:volume-up";
        if (volume === 0) icon = "ms:volume-off";
        else if (volume <= 50) icon = "ms:volume-down";
        return {
          state: {
            label: `${Math.round(volume)}%`,
            progress: volume / 100,
            icon,
          },
          variables: {},
        };
      },
    });

    ctx.registerStateProvider({
      id: "mute_state",
      name: "Mute State",
      description: "Audio mute status with red background when muted",
      icon: "ms:volume-up",
      providesIcon: true,
      paramsSchema: targetSchema,
      resolve(params) {
        const p = params as Record<string, unknown>;
        const target = (p.target as string | undefined) ?? config.default_target;
        const agentState = getAgentState(target);
        const isMuted = (agentState?.is_muted as boolean) ?? false;
        return isMuted
          ? { state: { icon: "ms:volume-up", background: "#ef4444" }, variables: {} }
          : { state: { icon: "ms:volume-off" }, variables: {} };
      },
    });

    ctx.registerStateProvider({
      id: "mic_state",
      name: "Mic State",
      description: "Microphone mute status with red background when muted",
      icon: "ms:mic",
      providesIcon: true,
      paramsSchema: targetSchema,
      resolve(params) {
        const p = params as Record<string, unknown>;
        const target = (p.target as string | undefined) ?? config.default_target;
        const agentState = getAgentState(target);
        const isMuted = (agentState?.mic_muted as boolean) ?? false;
        return isMuted
          ? { state: { icon: "ms:mic", background: "#ef4444" }, variables: {} }
          : { state: { icon: "ms:mic-off" }, variables: {} };
      },
    });

    ctx.registerStateProvider({
      id: "output_device",
      name: "Output Device",
      description: "Current audio output device name",
      icon: "ms:speaker",
      providesIcon: false,
      paramsSchema: targetSchema,
      templateVariables: [
        { key: "device", label: "Device Name", example: "MacBook Pro Speakers" },
      ],
      resolve(params) {
        const p = params as Record<string, unknown>;
        const target = (p.target as string | undefined) ?? config.default_target;
        const devices = getOutputDevices(target);
        const active = devices.find((d) => d.active);
        return {
          state: { label: active?.name ?? "Unknown" },
          variables: { device: active?.name ?? "" },
        };
      },
    });

    ctx.registerStateProvider({
      id: "input_device",
      name: "Input Device",
      description: "Current audio input device name",
      icon: "ms:mic-external-on",
      providesIcon: false,
      paramsSchema: targetSchema,
      templateVariables: [
        { key: "device", label: "Device Name", example: "MacBook Pro Microphone" },
      ],
      resolve(params) {
        const p = params as Record<string, unknown>;
        const target = (p.target as string | undefined) ?? config.default_target;
        const devices = getInputDevices(target);
        const active = devices.find((d) => d.active);
        return {
          state: { label: active?.name ?? "Unknown" },
          variables: { device: active?.name ?? "" },
        };
      },
    });

    // --- Dynamic Pages ---

    // Output devices page — one button per available output device
    ctx.registerPageProvider("output_devices", () => {
      const target = ctx.state.get("sound", "active_agent") as string | undefined ?? config.default_target;
      const rawDevices = getOutputDevices(target);
      const devices = applyDeviceFilter(rawDevices, config.device_filter?.output);

      const buttons: Array<Record<string, unknown>> = devices.slice(0, 14).map((device, i) => ({
        pos: [i % 5, Math.floor(i / 5)],
        action: "sound.change_output_device",
        params: { device: device.id, target },
        icon: device.active ? "ms:speaker" : "ms:speaker-outlined",
        iconColor: device.active ? "#22c55e" : undefined,
        label: device.name.length > 10 ? device.name.slice(0, 9) + "…" : device.name,
        scrollLabel: true,
      }));

      buttons.push({
        pos: [4, 2],
        action: "omnideck-core.go_back",
        icon: "ms:arrow-back",
        label: "Back",
      });

      return { page: "sound.output_devices", name: "Output Devices", buttons };
    });

    // Input devices page — one button per available input device
    ctx.registerPageProvider("input_devices", () => {
      const target = ctx.state.get("sound", "active_agent") as string | undefined ?? config.default_target;
      const rawDevices = getInputDevices(target);
      const devices = applyDeviceFilter(rawDevices, config.device_filter?.input);

      const buttons: Array<Record<string, unknown>> = devices.slice(0, 14).map((device, i) => ({
        pos: [i % 5, Math.floor(i / 5)],
        action: "sound.change_input_device",
        params: { device: device.id, target },
        icon: device.active ? "ms:mic" : "ms:mic-off",
        iconColor: device.active ? "#22c55e" : undefined,
        label: device.name.length > 10 ? device.name.slice(0, 9) + "…" : device.name,
        scrollLabel: true,
      }));

      buttons.push({
        pos: [4, 2],
        action: "omnideck-core.go_back",
        icon: "ms:arrow-back",
        label: "Back",
      });

      return { page: "sound.input_devices", name: "Input Devices", buttons };
    });

    // --- Presets ---

    for (const preset of soundPresets) {
      ctx.registerPreset(preset);
    }

    ctx.setHealth({ status: "ok" });
  },

  async destroy() {},
};

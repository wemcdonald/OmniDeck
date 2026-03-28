import { z } from "zod";
import { field } from "@omnideck/plugin-schema";
import type { OmniDeckPlugin, PluginContext } from "../../types.js";
import { soundPresets } from "./presets.js";

interface SoundConfig {
  default_target?: string;
  default_step?: number;
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

export const soundPlugin: OmniDeckPlugin = {
  id: "sound",
  name: "Sound",
  version: "1.0.0",
  icon: "ms:volume-up",

  async init(ctx: PluginContext) {
    const config = ctx.config as SoundConfig;
    const defaultStep = config.default_step ?? 10;

    function resolveTarget(params: unknown, actionCtx: { focusedAgent?: string }) {
      const p = params as Record<string, unknown>;
      return (p.target as string | undefined) ?? actionCtx.focusedAgent ?? config.default_target;
    }

    function getAgentState(target: string | undefined) {
      if (!target) return undefined;
      return ctx.state.get("os-control", `agent:${target}:state`) as
        | Record<string, unknown>
        | undefined;
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

    // --- State Providers ---

    ctx.registerStateProvider({
      id: "volume_level",
      name: "Volume Level",
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

    // --- Presets ---

    for (const preset of soundPresets) {
      ctx.registerPreset(preset);
    }

    ctx.setHealth({ status: "ok" });
  },

  async destroy() {},
};

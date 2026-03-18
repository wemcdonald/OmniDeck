import type { OmniDeckPlugin, PluginContext } from "../../types.js";
import { soundPresets } from "./presets.js";

interface SoundConfig {
  default_target?: string;
  default_step?: number;
}

export const soundPlugin: OmniDeckPlugin = {
  id: "sound",
  name: "Sound",
  version: "1.0.0",

  async init(ctx: PluginContext) {
    const config = ctx.config as SoundConfig;
    const defaultStep = config.default_step ?? 5;

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
    ] as const;

    for (const actionId of simpleActions) {
      ctx.registerAction({
        id: actionId,
        name: actionId.replace(/_/g, " "),
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
      async execute(params, actionCtx) {
        const p = params as Record<string, unknown>;
        const step = (p.step as number) ?? defaultStep;
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
      async execute(params, actionCtx) {
        const p = params as Record<string, unknown>;
        const step = (p.step as number) ?? defaultStep;
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
      resolve(params) {
        const p = params as Record<string, unknown>;
        const target = (p.target as string | undefined) ?? config.default_target;
        const agentState = getAgentState(target);
        const volume = (agentState?.volume as number) ?? 0;
        let icon = "ms:volume_up";
        if (volume === 0) icon = "ms:volume_off";
        else if (volume <= 50) icon = "ms:volume_down";
        return {
          label: `${Math.round(volume)}%`,
          progress: volume / 100,
          icon,
        };
      },
    });

    ctx.registerStateProvider({
      id: "mute_state",
      resolve(params) {
        const p = params as Record<string, unknown>;
        const target = (p.target as string | undefined) ?? config.default_target;
        const agentState = getAgentState(target);
        const isMuted = (agentState?.is_muted as boolean) ?? false;
        return isMuted
          ? { icon: "ms:volume_off", background: "#ef4444" }
          : { icon: "ms:volume_up" };
      },
    });

    ctx.registerStateProvider({
      id: "mic_state",
      resolve(params) {
        const p = params as Record<string, unknown>;
        const target = (p.target as string | undefined) ?? config.default_target;
        const agentState = getAgentState(target);
        const isMuted = (agentState?.mic_muted as boolean) ?? false;
        return isMuted
          ? { icon: "ms:mic_off", background: "#ef4444" }
          : { icon: "ms:mic" };
      },
    });

    // --- Presets ---

    for (const preset of soundPresets) {
      ctx.registerPreset(preset);
    }
  },

  async destroy() {},
};

// Standalone os-control plugin — kept in sync with hub/src/plugins/builtin/os-control/index.ts
import { z } from "zod";
import { field } from "@omnideck/plugin-schema";
import type { OmniDeckPlugin, PluginContext } from "../../hub/src/plugins/types.js";

interface OsControlConfig {
  default_target: string;
}

const targetParam = {
  target: field(z.string().optional(), { label: "Target", fieldType: "agent" as const }),
};

const extraFields: Record<string, Record<string, z.ZodType>> = {
  launch_app: { app: field(z.string(), { label: "App Name" }) },
  focus_app:  { app: field(z.string(), { label: "App Name" }) },
  send_keystroke: { keys: field(z.array(z.string()), { label: "Keys" }) },
  set_volume: { level: field(z.number().min(0).max(100), { label: "Volume" }) },
  set_mic_volume: { level: field(z.number().min(0).max(100), { label: "Volume" }) },
  switch_audio_output: { device: field(z.string(), { label: "Device Name" }) },
  switch_audio_input:  { device: field(z.string(), { label: "Device Name" }) },
};

const actionDescriptions: Record<string, { description: string; icon: string }> = {
  launch_app:          { description: "Launch an application", icon: "ms:launch" },
  focus_app:           { description: "Focus an application window", icon: "ms:open-in-new" },
  send_keystroke:      { description: "Send a keyboard shortcut", icon: "ms:keyboard" },
  set_volume:          { description: "Set system volume", icon: "ms:volume-up" },
  set_mic_volume:      { description: "Set microphone volume", icon: "ms:mic" },
  sleep:               { description: "Put the system to sleep", icon: "ms:bedtime" },
  lock:                { description: "Lock the screen", icon: "ms:lock" },
  switch_audio_output: { description: "Switch audio output device", icon: "ms:speaker" },
  switch_audio_input:  { description: "Switch audio input device", icon: "ms:mic-external-on" },
};

const targetOnlySchema = z.object(targetParam);

const configSchema = z.object({
  default_target: field(z.string().optional(), { label: "Default Agent", fieldType: "agent" as const }),
});

export const osControlPlugin: OmniDeckPlugin = {
  id: "os-control",
  name: "OS Control",
  version: "1.0.0",
  configSchema,

  async init(ctx: PluginContext) {
    const config = ctx.config as OsControlConfig;

    // Shared target resolution — explicit param > focused agent > config default
    function resolveTarget(params: Record<string, unknown>, actionCtx: { focusedAgent?: string }) {
      return (params.target as string | undefined)
        ?? actionCtx.focusedAgent
        ?? config.default_target;
    }

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
      const schema = extra ? z.object({ ...extra, ...targetParam }) : targetOnlySchema;
      const meta = actionDescriptions[actionId];

      ctx.registerAction({
        id: actionId,
        name: actionId.replace(/_/g, " "),
        description: meta.description,
        icon: meta.icon,
        paramsSchema: schema,
        async execute(params, actionCtx) {
          const p = params as Record<string, unknown>;
          const target = resolveTarget(p, actionCtx);
          ctx.state.set("os-control", `pending:${target}:${actionId}`, {
            params,
            timestamp: Date.now(),
          });
        },
      });
    }

    ctx.registerStateProvider({
      id: "active_window",
      resolve(params) {
        const p = params as Record<string, unknown>;
        const target = (p.target as string | undefined) ?? config.default_target;
        const agentState = ctx.state.get(
          "os-control",
          `agent:${target}:state`,
        ) as Record<string, unknown> | undefined;
        const title = (agentState?.active_window_title as string) ?? "";
        return { label: title };
      },
    });

    ctx.registerStateProvider({
      id: "volume_level",
      resolve(params) {
        const p = params as Record<string, unknown>;
        const target = (p.target as string | undefined) ?? config.default_target;
        const agentState = ctx.state.get(
          "os-control",
          `agent:${target}:state`,
        ) as Record<string, unknown> | undefined;
        const volume = (agentState?.volume as number) ?? 0;
        return {
          label: `${Math.round(volume)}%`,
          progress: volume / 100,
        };
      },
    });

    ctx.registerStateProvider({
      id: "app_running",
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
        return isRunning ? {} : { opacity: 0.5 };
      },
    });

    ctx.registerPreset({
      id: "app_launcher",
      name: "App Launcher",
      action: "launch_app",
      stateProvider: "app_running",
      defaults: {
        icon: "app",
        label: "Launch App",
      },
    });
  },

  async destroy() {},
};

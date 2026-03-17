import type { OmniDeckPlugin, PluginContext } from "../../types.js";

interface OsControlConfig {
  default_target: string;
}

export const osControlPlugin: OmniDeckPlugin = {
  id: "os-control",
  name: "OS Control",
  version: "1.0.0",

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
      ctx.registerAction({
        id: actionId,
        name: actionId.replace(/_/g, " "),
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
      defaults: {
        action: "launch_app",
        icon: "app",
      },
      mapParams(params) {
        return {
          actionParams: { app: params.app, target: params.target },
          stateParams: { app: params.app, target: params.target },
        };
      },
    });
  },

  async destroy() {},
};

import { z } from "zod";
import { field } from "@omnideck/plugin-schema";
import type { OmniDeckPlugin, PluginContext } from "../../types.js";

interface MonitorControlConfig {
  default_target?: string;
}

interface MonitorInfo {
  id: string;
  name: string;
  currentInput: number;
  currentInputName: string;
  inputs: Array<{ value: number; name: string }>;
}

const DEFAULT_INPUT_NAMES: Record<number, string> = {
  1: "VGA-1", 2: "VGA-2",
  3: "DVI-1", 4: "DVI-2",
  15: "DP-1", 16: "DP-2",
  17: "HDMI-1", 18: "HDMI-2",
  27: "USB-C",
};

const targetParam = {
  target: field(z.string().optional(), { label: "Target", fieldType: "agent" as const }),
};

export const monitorControlPlugin: OmniDeckPlugin = {
  id: "monitor-control",
  name: "Monitor Control",
  version: "1.0.0",
  icon: "ms:monitor",

  async init(ctx: PluginContext) {
    const config = ctx.config as MonitorControlConfig;

    function resolveTarget(params: Record<string, unknown>, actionCtx: { focusedAgent?: string }) {
      return (params.target as string | undefined) ?? actionCtx.focusedAgent ?? config.default_target;
    }

    function getMonitors(target: string | undefined): MonitorInfo[] {
      if (!target) return [];
      return (ctx.state.get("monitor-control", `agent:${target}:monitors`) as MonitorInfo[]) ?? [];
    }

    // --- Actions ---

    // set_input: dispatches to agent
    ctx.registerAction({
      id: "set_input",
      name: "Set Monitor Input",
      description: "Switch a monitor to a specific input",
      icon: "ms:input",
      paramsSchema: z.object({
        ...targetParam,
        monitor: field(z.string().optional(), { label: "Monitor ID" }),
        input: field(z.number(), { label: "Input Value", description: "DDC/CI VCP 0x60 value (e.g., 17=HDMI-1, 15=DP-1)" }),
      }),
      async execute(params, actionCtx) {
        const target = resolveTarget(params as Record<string, unknown>, actionCtx);
        ctx.state.set("monitor-control", `pending:${target}:set_input`, {
          params,
          timestamp: Date.now(),
        });
      },
    });

    // next_input: dispatches to agent
    ctx.registerAction({
      id: "next_input",
      name: "Next Monitor Input",
      description: "Cycle to the next monitor input",
      icon: "ms:swap-horiz",
      paramsSchema: z.object({
        ...targetParam,
        monitor: field(z.string().optional(), { label: "Monitor ID" }),
        inputs: field(z.record(z.unknown()).optional(), {
          label: "Input Mappings",
          description: "Map input values to names/icons, e.g. { 17: { name: 'Kerby' } }",
        }),
      }),
      async execute(params, actionCtx) {
        const target = resolveTarget(params as Record<string, unknown>, actionCtx);
        ctx.state.set("monitor-control", `pending:${target}:next_input`, {
          params,
          timestamp: Date.now(),
        });

        // Optimistic update: cycle the input in the store immediately
        const monitors = getMonitors(target);
        if (monitors.length > 0) {
          const mon = monitors[0];
          const p = params as Record<string, unknown>;
          const configInputs = p.inputs as Record<string, unknown> | undefined;
          let inputValues: number[];
          if (configInputs) {
            inputValues = Object.keys(configInputs).map(Number).sort((a, b) => a - b);
          } else if (mon.inputs.length > 0) {
            inputValues = mon.inputs.map((i) => i.value);
          } else {
            inputValues = [15, 17];
          }
          const currentIdx = inputValues.indexOf(mon.currentInput);
          const nextInput = inputValues[(currentIdx + 1) % inputValues.length];
          mon.currentInput = nextInput;
          mon.currentInputName = DEFAULT_INPUT_NAMES[nextInput] ?? `Input ${nextInput}`;
          ctx.state.set("monitor-control", `agent:${target}:monitors`, monitors);
        }
      },
    });

    // --- State Provider ---

    ctx.registerStateProvider({
      id: "monitor_input",
      name: "Monitor Input",
      description: "Current monitor input with configurable names and icons",
      icon: "ms:monitor",
      providesIcon: true,
      paramsSchema: z.object({
        ...targetParam,
        inputs: field(z.record(z.unknown()).optional(), { label: "Input Mappings" }),
      }),
      templateVariables: [
        { key: "input_name", label: "Input Name", example: "HDMI-1" },
        { key: "input_value", label: "Input Value", example: "17" },
        { key: "monitor_name", label: "Monitor Name", example: "Dell U2723QE" },
      ],
      resolve(params) {
        const p = params as Record<string, unknown>;
        const target = (p.target as string | undefined) ?? config.default_target;
        const monitors = getMonitors(target);
        const configInputs = p.inputs as Record<string, Record<string, string>> | undefined;

        if (monitors.length === 0) {
          return {
            state: { icon: "ms:monitor", label: "No monitor", opacity: 0.4 },
            variables: { input_name: "", input_value: "", monitor_name: "" },
          };
        }

        const mon = monitors[0];
        const inputCfg = configInputs?.[String(mon.currentInput)];
        const inputName = inputCfg?.name ?? mon.currentInputName;
        const inputIcon = inputCfg?.icon ?? "ms:monitor";

        return {
          state: {
            icon: inputIcon,
            label: inputName,
          },
          variables: {
            input_name: inputName,
            input_value: String(mon.currentInput),
            monitor_name: mon.name,
          },
        };
      },
    });

    // --- Presets ---

    ctx.registerPreset({
      id: "input_toggle",
      name: "Input Toggle",
      description: "Cycle monitor input on press",
      category: "Monitor",
      icon: "ms:monitor",
      action: "next_input",
      stateProvider: "monitor_input",
      defaults: {
        icon: "ms:monitor",
        label: "{{input_name}}",
      },
    });

    ctx.registerPreset({
      id: "input_select",
      name: "Input Select",
      description: "Switch to a specific monitor input",
      category: "Monitor",
      icon: "ms:input",
      action: "set_input",
      stateProvider: "monitor_input",
      defaults: {
        icon: "ms:monitor",
        label: "{{input_name}}",
      },
    });

    ctx.setHealth({ status: "ok" });
  },

  async destroy() {},
};

// plugins/bettertouchtool/hub.ts
// Hub-side plugin: registers actions, state providers, and button presets.
import type { OmniDeckPlugin, PluginContext } from "../../hub/src/plugins/types.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Config schema (validated by hub on plugin install / config save)
// ---------------------------------------------------------------------------

export const configSchema = z.object({
  port: z.number().default(12345).describe("BTT web server port"),
  secret: z.string().optional().describe("BTT shared secret (leave blank if disabled)"),
  poll_interval: z.string().default("2s").describe("How often to poll BTT for trigger list"),
});

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

export default {
  id: "bettertouchtool",
  name: "BetterTouchTool",
  version: "0.1.0",
  configSchema,

  async init(ctx: PluginContext) {
    // ------------------------------------------------------------------
    // Action: run_trigger
    // Hub receives this from a button press and forwards it to the agent
    // that has BTT running (identified by targetAgent / focusedAgent).
    // ------------------------------------------------------------------
    ctx.registerAction({
      id: "run_trigger",
      name: "Run BTT Trigger",
      paramsSchema: z.object({
        name: z.string().describe("Name of the BTT named trigger to execute"),
      }),
      async execute(params, actionCtx) {
        ctx.state.set("bettertouchtool", "pending_command", {
          command: "run_trigger",
          target: actionCtx.targetAgent ?? actionCtx.focusedAgent,
          params,
        });
      },
    });

    // ------------------------------------------------------------------
    // State provider: triggers
    // Surfaces the live trigger list polled from BTT on the agent machine.
    // ------------------------------------------------------------------
    ctx.registerStateProvider({
      id: "triggers",
      resolve() {
        const triggers = ctx.state.get("bettertouchtool", "triggers") as unknown[] | undefined;
        return {
          label: triggers != null ? `${triggers.length} triggers` : "...",
        };
      },
    });

    // ------------------------------------------------------------------
    // Preset: btt_trigger_button
    // A ready-made button preset users can drop onto the deck.
    // ------------------------------------------------------------------
    ctx.registerPreset({
      id: "btt_trigger_button",
      name: "BTT Trigger",
      defaults: {
        action: "run_trigger",
        icon: "command",
        label: "BTT",
        stateProvider: "triggers",
      },
      mapParams: (p) => ({
        actionParams: { name: p.name },
        stateParams: {},
      }),
    });
  },

  async destroy() {
    // No persistent hub-side resources to clean up.
  },
} satisfies OmniDeckPlugin;

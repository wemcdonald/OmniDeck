import { z } from "zod";
import { field } from "@omnideck/plugin-schema";
import type { OmniDeckPlugin, PluginContext, ActionContext } from "../../types.js";

// ── Shared sub-schemas for meta-actions ────────────────────────────────────

const ActionRefSchema = z.object({
  action: z.string(),
  params: z.record(z.unknown()).optional(),
});

// ── multi_action schema ────────────────────────────────────────────────────

const MultiActionSchema = z.object({
  mode: field(z.enum(["sequential", "parallel"]).default("sequential"), {
    label: "Execution Mode",
  }),
  actions: field(z.array(ActionRefSchema), {
    label: "Actions",
    fieldType: "action_list",
  }),
});

// ── if_then_else schema ────────────────────────────────────────────────────

const ConditionSchema = z.object({
  provider: field(z.string(), { label: "State Provider" }),
  variable: field(z.string(), { label: "Variable" }),
  operator: field(
    z.enum(["==", "!=", ">", "<", ">=", "<=", "contains"]),
    { label: "Operator" },
  ),
  value: field(z.string(), { label: "Value" }),
});

const IfThenElseSchema = z.object({
  condition: field(ConditionSchema, { label: "Condition", fieldType: "condition" }),
  then_actions: field(z.array(ActionRefSchema), {
    label: "Then",
    fieldType: "action_list",
  }),
  else_actions: field(z.array(ActionRefSchema).optional(), {
    label: "Else",
    fieldType: "action_list",
  }),
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Split a qualified action string like "home-assistant.toggle" into [pluginId, actionId]. */
function splitAction(qualified: string): [string, string] {
  const dot = qualified.indexOf(".");
  if (dot === -1) throw new Error(`Invalid action reference: "${qualified}" (expected "pluginId.actionId")`);
  return [qualified.slice(0, dot), qualified.slice(dot + 1)];
}

async function executeActionRefs(
  actions: Array<{ action: string; params?: Record<string, unknown> }>,
  context: ActionContext,
): Promise<void> {
  for (const ref of actions) {
    const [pluginId, actionId] = splitAction(ref.action);
    await context.triggerAction(pluginId, actionId, ref.params ?? {});
  }
}

async function executeActionRefsParallel(
  actions: Array<{ action: string; params?: Record<string, unknown> }>,
  context: ActionContext,
): Promise<void> {
  await Promise.all(
    actions.map((ref) => {
      const [pluginId, actionId] = splitAction(ref.action);
      return context.triggerAction(pluginId, actionId, ref.params ?? {});
    }),
  );
}

function evaluateCondition(
  actual: string | undefined,
  operator: string,
  expected: string,
): boolean {
  if (actual === undefined) return false;

  switch (operator) {
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case "contains":
      return actual.includes(expected);
    case ">":
      return Number(actual) > Number(expected);
    case "<":
      return Number(actual) < Number(expected);
    case ">=":
      return Number(actual) >= Number(expected);
    case "<=":
      return Number(actual) <= Number(expected);
    default:
      return false;
  }
}

// ── Plugin ─────────────────────────────────────────────────────────────────

export const corePlugin: OmniDeckPlugin = {
  id: "omnideck-core",
  name: "OmniDeck Core",
  version: "1.0.0",
  icon: "ms:settings",

  async init(ctx: PluginContext) {
    const pageHistory: string[] = [];

    const changePageSchema = z.object({
      page: field(z.string(), { label: "Page", fieldType: "page" }),
    });

    ctx.registerAction({
      id: "change_page",
      name: "Change Page",
      description: "Navigate to a different page",
      icon: "ms:tab",
      paramsSchema: changePageSchema,
      async execute(params) {
        const { page } = changePageSchema.parse(params);
        const current = ctx.state.get("omnideck-core", "current_page") as
          | string
          | undefined;
        if (current !== undefined) {
          pageHistory.push(current);
        }
        ctx.state.set("omnideck-core", "current_page", page);
      },
    });

    ctx.registerAction({
      id: "go_back",
      name: "Go Back",
      description: "Go back to the previous page",
      icon: "ms:arrow-back",
      async execute() {
        const prev = pageHistory.pop();
        if (prev !== undefined) {
          ctx.state.set("omnideck-core", "current_page", prev);
        }
      },
    });

    const setBrightnessSchema = z.object({
      brightness: field(z.number().min(0).max(100), { label: "Brightness" }),
    });

    ctx.registerAction({
      id: "set_brightness",
      name: "Set Brightness",
      description: "Set deck brightness",
      icon: "ms:brightness-6",
      paramsSchema: setBrightnessSchema,
      async execute(params) {
        const { brightness } = setBrightnessSchema.parse(params);
        ctx.state.set("omnideck-core", "brightness", brightness);
      },
    });

    ctx.registerAction({
      id: "sleep_deck",
      name: "Sleep Deck",
      description: "Put the deck to sleep",
      icon: "ms:bedtime",
      async execute() {
        ctx.state.set("omnideck-core", "sleeping", true);
      },
    });

    ctx.registerAction({
      id: "reload_config",
      name: "Reload Config",
      description: "Reload the configuration",
      icon: "ms:refresh",
      async execute() {
        ctx.state.set("omnideck-core", "reload_requested", true);
      },
    });

    // ── multi_action ─────────────────────────────────────────────────────

    ctx.registerAction({
      id: "multi_action",
      name: "Multi Action",
      description: "Execute multiple actions in sequence or parallel",
      icon: "ms:playlist-play",
      paramsSchema: MultiActionSchema,
      async execute(params, context) {
        const { mode, actions } = MultiActionSchema.parse(params);
        if (mode === "parallel") {
          await executeActionRefsParallel(actions, context);
        } else {
          await executeActionRefs(actions, context);
        }
      },
    });

    ctx.registerPreset({
      id: "multi_action",
      name: "Multi Action",
      icon: "ms:playlist-play",
      action: "multi_action",
      defaults: {
        icon: "ms:playlist-play",
      },
    });

    // ── if_then_else ─────────────────────────────────────────────────────

    ctx.registerAction({
      id: "if_then_else",
      name: "If / Then / Else",
      description: "Execute actions conditionally based on state",
      icon: "ms:call-split",
      paramsSchema: IfThenElseSchema,
      async execute(params, context) {
        const { condition, then_actions, else_actions } =
          IfThenElseSchema.parse(params);

        // Resolve the state provider to get current variable values
        const result = context.resolveState?.(condition.provider, {});
        const actual = result?.variables[condition.variable];
        const matches = evaluateCondition(actual, condition.operator, condition.value);

        if (matches) {
          await executeActionRefs(then_actions, context);
        } else if (else_actions) {
          await executeActionRefs(else_actions, context);
        }
      },
    });

    ctx.setHealth({ status: "ok" });
  },

  async destroy() {},
};

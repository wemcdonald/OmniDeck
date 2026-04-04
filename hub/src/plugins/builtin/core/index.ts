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
        ctx.state.set("omnideck-core", "current_page", page);
      },
    });

    ctx.registerAction({
      id: "go_back",
      name: "Go Back",
      description: "Go back to the previous page",
      icon: "ms:arrow-back",
      async execute() {
        ctx.state.set("omnideck-core", "go_back_request", Date.now());
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

    // ── State Providers ─────────────────────────────────────────────────

    ctx.registerStateProvider({
      id: "mode",
      name: "Active Mode",
      description: "The currently active OmniDeck mode",
      icon: "ms:conversion_path",
      templateVariables: [
        { key: "active_mode", label: "Active Mode ID", example: "gaming" },
        { key: "active_mode_name", label: "Active Mode Name", example: "Gaming" },
        { key: "active_mode_icon", label: "Active Mode Icon", example: "ms:sports_esports" },
      ],
      resolve() {
        const modeId = ctx.state.get("omnideck-core", "active_mode") as string | null;
        const modeName = ctx.state.get("omnideck-core", "active_mode_name") as string | null;
        const modeIcon = ctx.state.get("omnideck-core", "active_mode_icon") as string | null;

        return {
          state: {
            label: modeName ?? "None",
            icon: modeIcon ?? undefined,
            background: modeId ? "#1e40af" : "#000000",
          },
          variables: {
            active_mode: modeId ?? "none",
            active_mode_name: modeName ?? "None",
            active_mode_icon: modeIcon ?? "",
          },
        };
      },
    });

    ctx.registerStateProvider({
      id: "all_agents_idle",
      name: "All Agents Idle",
      description: "Whether all connected agents are idle",
      icon: "ms:flight_takeoff",
      templateVariables: [
        { key: "idle", label: "All Idle", example: "true" },
        { key: "agent_count", label: "Agent Count", example: "2" },
        { key: "idle_count", label: "Idle Agent Count", example: "2" },
      ],
      resolve() {
        const allOsControl = ctx.state.getAll("os-control");
        let agentCount = 0;
        let idleCount = 0;
        const IDLE_THRESHOLD_MS = 300_000; // 5 minutes

        for (const [key, value] of allOsControl) {
          if (!key.match(/^agent:.+:state$/)) continue;
          const hostname = key.split(":")[1];
          const online = ctx.state.get("os-control", `agent:${hostname}:online`) as boolean | undefined;
          if (!online) continue;

          agentCount++;
          const state = value as Record<string, unknown> | undefined;
          // Default to 0 (assume active) if idle_time_ms not yet reported
          const idleTime = (state?.idle_time_ms as number) ?? 0;
          if (idleTime >= IDLE_THRESHOLD_MS) {
            idleCount++;
          }
        }

        const allIdle = agentCount === 0 || idleCount === agentCount;

        return {
          state: {
            label: allIdle ? "Idle" : "Active",
            background: allIdle ? "#000000" : "#16a34a",
          },
          variables: {
            idle: String(allIdle),
            agent_count: String(agentCount),
            idle_count: String(idleCount),
          },
        };
      },
    });

    ctx.registerStateProvider({
      id: "time",
      name: "Current Time",
      description: "Current time of day, day of week, etc.",
      icon: "ms:schedule",
      templateVariables: [
        { key: "hour", label: "Hour (0-23)", example: "14" },
        { key: "minute", label: "Minute (0-59)", example: "30" },
        { key: "hour_minute", label: "HH:MM", example: "14:30" },
        { key: "day_of_week", label: "Day of Week", example: "monday" },
        { key: "is_weekend", label: "Is Weekend", example: "false" },
      ],
      resolve() {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const dayOfWeek = dayNames[now.getDay()];
        const isWeekend = now.getDay() === 0 || now.getDay() === 6;

        return {
          state: {
            label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
          },
          variables: {
            hour: String(hour),
            minute: String(minute),
            hour_minute: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
            day_of_week: dayOfWeek,
            is_weekend: String(isWeekend),
          },
        };
      },
    });

    // ── Manual mode override ──────────────────────────────────────────

    const setModeSchema = z.object({
      mode: field(z.string(), { label: "Mode ID", description: "Mode to force-activate (or 'auto' to resume automatic)" }),
    });

    ctx.registerAction({
      id: "set_mode",
      name: "Set Mode",
      description: "Manually override the active mode",
      icon: "ms:conversion_path",
      paramsSchema: setModeSchema,
      async execute(params) {
        const { mode } = setModeSchema.parse(params);
        if (mode === "auto") {
          ctx.state.set("omnideck-core", "mode_override", null);
        } else {
          ctx.state.set("omnideck-core", "mode_override", mode);
        }
      },
    });

    ctx.setHealth({ status: "ok" });
  },

  async destroy() {},
};

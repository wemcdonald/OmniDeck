import { z } from "zod";

export const DeckConfigSchema = z.object({
  driver: z.enum(["auto", "elgato", "mirabox"]).default("auto"),
  brightness: z.number().min(0).max(100).default(100),
  idle_dim_after: z.string().optional(),
  idle_dim_brightness: z.number().min(0).max(100).optional(),
  wake_on_touch: z.boolean().default(true),
  default_page: z.string(),
});

export const DeviceConfigSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  platform: z.enum(["darwin", "windows", "linux"]),
  address: z.string().optional(),
});

const ConditionalOverrideSchema = z
  .object({
    icon: z.string().optional(),
    background: z.string().optional(),
    label: z.string().optional(),
    opacity: z.number().min(0).max(1).optional(),
  })
  .optional();

const ButtonStateSchema = z.object({
  provider: z.string(),
  params: z.record(z.unknown()).optional(),
  when_true: ConditionalOverrideSchema,
  when_false: ConditionalOverrideSchema,
});

const StyleSchema = z
  .object({
    font_size: z.number().optional(),
    label_color: z.string().optional(),
    label_align: z.enum(["left", "center", "right"]).optional(),
    show_active_window: z.boolean().optional(),
  })
  .optional();

// Nullable fields allow clearing a base value (e.g. action: null removes the action)
const ButtonModeOverrideSchema = z.object({
  action: z.string().nullable().optional(),
  params: z.record(z.unknown()).nullable().optional(),
  state: ButtonStateSchema.nullable().optional(),
  icon: z.string().nullable().optional(),
  icon_color: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  label_color: z.string().nullable().optional(),
  top_label: z.string().nullable().optional(),
  top_label_color: z.string().nullable().optional(),
  background: z.string().nullable().optional(),
  opacity: z.number().min(0).max(1).nullable().optional(),
  long_press_action: z.string().nullable().optional(),
  long_press_params: z.record(z.unknown()).nullable().optional(),
  press_action: z.string().nullable().optional(),
  release_action: z.string().nullable().optional(),
});

export const ButtonConfigSchema = z.object({
  pos: z.tuple([z.number(), z.number()]),
  label: z.string().nullable().optional(),
  label_color: z.string().optional(),
  scroll_label: z.boolean().optional(),
  top_label: z.string().nullable().optional(),
  top_label_color: z.string().optional(),
  scroll_top_label: z.boolean().optional(),
  icon: z.string().nullable().optional(),
  icon_color: z.string().optional(),
  image: z.string().optional(),
  background: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  style: StyleSchema,
  action: z.string().optional(),
  params: z.record(z.unknown()).optional(),
  long_press_action: z.string().optional(),
  long_press_params: z.record(z.unknown()).optional(),
  press_action: z.string().optional(),
  release_action: z.string().optional(),
  state: ButtonStateSchema.optional(),
  preset: z.string().optional(),
  target: z.string().optional(),
  /** Per-mode overrides. Key is the mode ID. */
  modes: z.record(z.string(), ButtonModeOverrideSchema).optional(),
});

export const PageConfigSchema = z.object({
  page: z.string(),
  name: z.string().optional(),
  columns: z.number().optional(),
  buttons: z.array(ButtonConfigSchema).default([]),
});

// ── Mode check comparators (exactly one required per check) ──────────────

const COMPARATOR_KEYS = [
  "equals", "not_equals", "in", "not_in",
  "greater_than", "less_than", "contains", "matches",
] as const;

const ModeCheckSchema = z.object({
  provider: z.string(),
  params: z.record(z.unknown()).optional(),
  attribute: z.string(),
  target: z.string().optional(),
  not: z.boolean().optional(),
  equals: z.union([z.string(), z.number(), z.boolean()]).optional(),
  not_equals: z.union([z.string(), z.number(), z.boolean()]).optional(),
  in: z.array(z.union([z.string(), z.number()])).optional(),
  not_in: z.array(z.union([z.string(), z.number()])).optional(),
  greater_than: z.number().optional(),
  less_than: z.number().optional(),
  contains: z.string().optional(),
  matches: z.string().optional(),
}).refine(
  (c) => COMPARATOR_KEYS.some((k) => c[k] !== undefined),
  { message: "Mode check requires at least one comparator (equals, in, greater_than, etc.)" },
);

const ModeRuleSchema = z.object({
  condition: z.enum(["and", "or"]),
  checks: z.array(ModeCheckSchema).min(1),
});

const ModeActionSchema = z.object({
  switch_page: z.string().optional(),
  trigger_action: z.string().optional(),
  params: z.record(z.unknown()).optional(),
});

const ModeDefinitionSchema = z.object({
  name: z.string(),
  icon: z.string().optional(),
  priority: z.number().default(50),
  rules: z.array(ModeRuleSchema).min(1),
  on_enter: z.array(ModeActionSchema).optional(),
  on_exit: z.array(ModeActionSchema).optional(),
});

export const ModesConfigSchema = z.record(z.string(), ModeDefinitionSchema).optional();

const OrchestratorConfigSchema = z
  .object({
    focus: z
      .object({
        strategy: z.enum(["idle_time", "manual", "active_window"]).default("idle_time"),
        idle_threshold: z.string().default("30s"),
        switch_page_on_focus: z.boolean().default(true),
      })
      .optional(),
    media: z
      .object({
        route_to: z.enum(["active_player", "focused", "manual"]).default("active_player"),
      })
      .optional(),
    device_pages: z.record(z.string(), z.string()).optional(),
    discord: z.record(z.unknown()).optional(),
    cec: z.record(z.unknown()).optional(),
    agent_order: z.array(z.string()).optional(),
    plugins: z.record(z.object({
      agent_order: z.array(z.string()).optional(),
    })).optional(),
  })
  .optional();

const HubConfigSchema = z
  .object({
    name: z.string().default("OmniDeck"),
  })
  .optional();

const AuthConfigSchema = z
  .object({
    password_hash: z.string().optional(),
    tls_redirect: z.boolean().default(false),
  })
  .optional();

const LoggingConfigSchema = z
  .object({
    level: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
    file: z.string().optional(),
    plugins: z.record(z.enum(["trace", "debug", "info", "warn", "error"])).optional(),
  })
  .optional();

export const FullConfigSchema = z.object({
  deck: DeckConfigSchema,
  devices: z.array(DeviceConfigSchema).default([]),
  plugins: z.preprocess((v) => v ?? {}, z.record(z.record(z.unknown())).default({})),
  orchestrator: OrchestratorConfigSchema,
  modes: ModesConfigSchema,
  hub: HubConfigSchema,
  auth: AuthConfigSchema,
  logging: LoggingConfigSchema,
  pages: z.array(PageConfigSchema).default([]),
});

export type FullConfig = z.infer<typeof FullConfigSchema>;
export type DeckConfig = z.infer<typeof DeckConfigSchema>;
export type DeviceConfig = z.infer<typeof DeviceConfigSchema>;
export type ButtonConfig = z.infer<typeof ButtonConfigSchema>;
export type PageConfig = z.infer<typeof PageConfigSchema>;

export function validateConfig(raw: unknown): FullConfig {
  return FullConfigSchema.parse(raw);
}

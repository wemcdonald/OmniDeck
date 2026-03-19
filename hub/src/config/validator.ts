import { z } from "zod";

export const DeckConfigSchema = z.object({
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

export const ButtonConfigSchema = z.object({
  pos: z.tuple([z.number(), z.number()]),
  label: z.string().optional(),
  label_color: z.string().optional(),
  top_label: z.string().optional(),
  top_label_color: z.string().optional(),
  icon: z.string().optional(),
  icon_color: z.string().optional(),
  image: z.string().optional(),
  background: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  style: StyleSchema,
  action: z.string().optional(),
  params: z.record(z.unknown()).optional(),
  long_press_action: z.string().optional(),
  long_press_params: z.record(z.unknown()).optional(),
  state: ButtonStateSchema.optional(),
  preset: z.string().optional(),
  target: z.string().optional(),
});

export const PageConfigSchema = z.object({
  page: z.string(),
  name: z.string().optional(),
  columns: z.number().optional(),
  buttons: z.array(ButtonConfigSchema).default([]),
});

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
    discord: z.record(z.unknown()).optional(),
    cec: z.record(z.unknown()).optional(),
  })
  .optional();

export const FullConfigSchema = z.object({
  deck: DeckConfigSchema,
  devices: z.array(DeviceConfigSchema).default([]),
  plugins: z.preprocess((v) => v ?? {}, z.record(z.record(z.unknown())).default({})),
  orchestrator: OrchestratorConfigSchema,
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

import type { z } from "zod";
import type { TemplateVariable, PluginHealth } from "@omnideck/plugin-schema";
import type { StateStore } from "../state/store.js";
import type { Logger } from "pino";

export interface PluginContext {
  config: unknown;
  state: StateStore;
  log: Logger;
  registerAction(action: ActionDefinition): void;
  registerStateProvider(provider: StateProviderDefinition): void;
  registerPreset(preset: ButtonPreset): void;
  onOrchestratorEvent(event: string, cb: (data: unknown) => void): void;
  /** Report plugin health/config status. Call during init or on config change. */
  setHealth(health: PluginHealth): void;
}

export interface OmniDeckPlugin {
  id: string;
  name: string;
  version: string;
  /** Icon shown in the plugin browser (e.g., "ms:home"). */
  icon?: string;
  configSchema?: z.ZodType;
  init(context: PluginContext): Promise<void>;
  destroy(): Promise<void>;
  onConfigChange?(newConfig: unknown): Promise<void>;
}

// ── Actions ─────────────────────────────────────────────────────────────────

export interface ActionDefinition {
  id: string;
  name: string;
  /** Human-readable one-liner shown in the plugin browser. */
  description?: string;
  /** Icon shown in the plugin browser. */
  icon?: string;
  /** Zod schema for params. Used for validation AND catalog field extraction. */
  paramsSchema?: z.ZodObject<any>;
  execute(params: unknown, context: ActionContext): Promise<void>;
}

export interface ActionContext {
  targetAgent?: string;
  focusedAgent?: string;
  triggerAction(pluginId: string, actionId: string, params: unknown): Promise<void>;
  resolveState?(qualifiedId: string, params: unknown): StateProviderResult | undefined;
}

// ── State Providers ─────────────────────────────────────────────────────────

export interface StateProviderDefinition {
  id: string;
  /** Human-readable name shown in the plugin browser. */
  name: string;
  /** One-liner description. */
  description?: string;
  /** Icon shown in the plugin browser. */
  icon?: string;
  /** Zod schema for params. Used for validation AND catalog field extraction. */
  paramsSchema?: z.ZodObject<any>;
  /** Whether this provider dynamically controls the button icon. */
  providesIcon?: boolean;
  /** Mustache template variables this provider exposes. */
  templateVariables?: TemplateVariable[];
  /** Resolve current state + template variables for the given params. */
  resolve(params: unknown): StateProviderResult;
}

export interface StateProviderResult {
  /** The visual state (icon, background, progress, opacity, etc.). */
  state: ButtonStateResult;
  /** Template variables available for Mustache interpolation in labels. */
  variables: Record<string, string>;
}

export interface ButtonStateResult {
  label?: string;
  topLabel?: string;
  icon?: string | Buffer;
  iconColor?: string;
  background?: string;
  badge?: string | number;
  badgeColor?: string;
  progress?: number;
  opacity?: number;
}

// ── Presets ──────────────────────────────────────────────────────────────────

/**
 * A preset is a pre-packaged button config that references an Action and/or
 * State Provider by ID and provides default appearance values.
 *
 * It owns NO param schema — the editor shows the union of the referenced
 * action's and state provider's param schemas (deduplicated by key).
 * All user params are forwarded to both action and state provider.
 */
export interface ButtonPreset {
  id: string;
  name: string;
  description?: string;
  /** Grouping in the plugin browser (e.g., "Lighting", "Media"). */
  category?: string;
  /** Icon shown in the plugin browser (falls back to defaults.icon). */
  icon?: string;

  /** Which action this preset uses (by id within the same plugin). */
  action?: string;
  /** Which state provider this preset uses (by id within the same plugin). */
  stateProvider?: string;

  /** Default appearance values. Labels can use Mustache: "{{brightness_percent}}". */
  defaults: {
    icon?: string;
    label?: string;
    topLabel?: string;
    background?: string;
    iconColor?: string;
    labelColor?: string;
    topLabelColor?: string;
  };

  /** Optional long-press action (by id within the same plugin). */
  longPressAction?: string;
  /** Default params for the long-press action. */
  longPressDefaults?: Record<string, unknown>;
}

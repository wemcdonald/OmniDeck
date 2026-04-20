// Hub plugin types — used by both builtin and external plugins.
// These are abstract interfaces that don't depend on hub internals.

import type { z } from "zod";
import type { TemplateVariable, PluginHealth } from "./field.js";

// ── State Store & Logger abstractions ──────────────────────────────────────

export interface PluginStateStore {
  get(pluginId: string, key: string): unknown;
  set(pluginId: string, key: string, value: unknown): void;
  batch(fn: () => void): void;
}

export interface PluginLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  info(msg: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  warn(msg: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  error(msg: string): void;
  debug(obj: Record<string, unknown>, msg?: string): void;
  debug(msg: string): void;
}

// ── Plugin Context ─────────────────────────────────────────────────────────

export interface PluginContext {
  config: unknown;
  state: PluginStateStore;
  log: PluginLogger;
  registerAction(action: ActionDefinition): void;
  registerStateProvider(provider: StateProviderDefinition): void;
  registerPreset(preset: ButtonPreset): void;
  onOrchestratorEvent(event: string, cb: (data: unknown) => void): void;
  /** Report plugin health/config status. Call during init or on config change. */
  setHealth(health: PluginHealth): void;
  /** Write a default page config file if it doesn't already exist. User owns the file after creation. */
  scaffoldPage(id: string, config: { page: string; name?: string; columns?: number; buttons: Array<Record<string, unknown>> }): void;
  /** Register a dynamic page provider. The resolve function is called whenever the page needs to render. */
  registerPageProvider(id: string, resolve: () => { page: string; name?: string; columns?: number; buttons: Array<Record<string, unknown>> } | undefined): void;
  /** Schedule a recurring callback. Automatically cleared when the plugin is reloaded or destroyed. */
  setInterval(fn: () => void, ms: number): ReturnType<typeof setInterval>;
}

// ── Plugin Interface ───────────────────────────────────────────────────────

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

// ── Actions ────────────────────────────────────────────────────────────────

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

// ── State Providers ────────────────────────────────────────────────────────

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
  /** If true and icon is a Buffer, renders it full-bleed (no padding). */
  iconFullBleed?: boolean;
  iconColor?: string;
  background?: string;
  badge?: string | number;
  badgeColor?: string;
  progress?: number;
  opacity?: number;
  /** If true, label scrolls horizontally when it overflows the button width. */
  scrollLabel?: boolean;
  /** If true, topLabel scrolls horizontally when it overflows the button width. */
  scrollTopLabel?: boolean;
  /**
   * Large centered text that fills the body of the tile, wrapped at separators
   * (-/_/./space) and auto-sized to fit. When set, the main `icon` layer is
   * suppressed — the name IS the tile. Use with `cornerIcon` to keep a small
   * plugin/state identifier in a corner.
   */
  bodyLabel?: string;
  bodyLabelColor?: string;
  /**
   * Small icon composited into a chosen tile corner. Same formats as `icon`
   * (Material Symbol `ms:name`, emoji/text, or PNG Buffer). When the value is
   * an `ms:` icon, `cornerIconColor` tints it; Buffer icons composite as-is.
   */
  cornerIcon?: string | Buffer;
  cornerIconColor?: string;
  /** Corner for cornerIcon. Defaults to "tl" (top-left). */
  cornerIconPosition?: "tl" | "tr" | "bl" | "br";
}

// ── Presets ─────────────────────────────────────────────────────────────────

/**
 * A preset is a pre-packaged button config that references an Action and/or
 * State Provider by ID and provides default appearance values.
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
  /** Action fired on key DOWN (hold-to-activate, e.g. push-to-talk). Mutually exclusive with action. */
  pressAction?: string;
  /** Action fired on key UP when pressAction was used. */
  releaseAction?: string;
}

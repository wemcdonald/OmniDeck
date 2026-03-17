import type { z } from "zod";
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
}

export interface OmniDeckPlugin {
  id: string;
  name: string;
  version: string;
  configSchema?: z.ZodType;
  init(context: PluginContext): Promise<void>;
  destroy(): Promise<void>;
  onConfigChange?(newConfig: unknown): Promise<void>;
}

export interface ActionDefinition {
  id: string;
  name: string;
  paramsSchema?: z.ZodType;
  execute(params: unknown, context: ActionContext): Promise<void>;
}

export interface ActionContext {
  targetAgent?: string;
  focusedAgent?: string;
  triggerAction(pluginId: string, actionId: string, params: unknown): Promise<void>;
}

export interface StateProviderDefinition {
  id: string;
  paramsSchema?: z.ZodType;
  resolve(params: unknown): ButtonStateResult;
}

export interface ButtonStateResult {
  label?: string;
  topLabel?: string;
  icon?: string | Buffer;
  background?: string;
  badge?: string | number;
  badgeColor?: string;
  progress?: number;
  opacity?: number;
}

export interface ButtonPreset {
  id: string;
  name: string;
  defaults: {
    action?: string;
    icon?: string;
    label?: string;
    background?: string;
    stateProvider?: string;
  };
  mapParams(params: Record<string, unknown>): {
    actionParams?: Record<string, unknown>;
    stateParams?: Record<string, unknown>;
  };
}

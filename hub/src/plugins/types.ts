// Re-export all plugin types from the shared @omnideck/plugin-schema package.
// Builtin plugins can continue importing from this file — no changes needed.
export type {
  PluginContext,
  PluginStateStore,
  PluginLogger,
  OmniDeckPlugin,
  ActionDefinition,
  ActionContext,
  StateProviderDefinition,
  StateProviderResult,
  ButtonStateResult,
  ButtonPreset,
} from "@omnideck/plugin-schema";

import type {
  OmniDeckPlugin,
  PluginContext,
  ActionDefinition,
  StateProviderDefinition,
  ButtonPreset,
  ActionContext,
} from "./types.js";
import type { StateStore } from "../state/store.js";
import { createLogger } from "../logger.js";

type OrchestratorCallback = (data: unknown) => void;

export class PluginHost {
  private plugins = new Map<string, OmniDeckPlugin>();
  private actions = new Map<string, ActionDefinition>(); // "pluginId.actionId"
  private stateProviders = new Map<string, StateProviderDefinition>();
  private presets = new Map<string, ButtonPreset>();
  private orchestratorListeners = new Map<string, OrchestratorCallback[]>();
  private store: StateStore;

  constructor(store: StateStore) {
    this.store = store;
  }

  register(plugin: OmniDeckPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  async initAll(pluginConfigs: Record<string, unknown>): Promise<void> {
    for (const [id, plugin] of this.plugins) {
      const context: PluginContext = {
        config: pluginConfigs[id] ?? {},
        state: this.store,
        log: createLogger(`plugin:${id}`),
        registerAction: (action) => {
          this.actions.set(`${id}.${action.id}`, action);
        },
        registerStateProvider: (provider) => {
          this.stateProviders.set(`${id}.${provider.id}`, provider);
        },
        registerPreset: (preset) => {
          this.presets.set(`${id}.${preset.id}`, preset);
        },
        onOrchestratorEvent: (event, cb) => {
          const key = `${id}:${event}`;
          const existing = this.orchestratorListeners.get(key) ?? [];
          existing.push(cb);
          this.orchestratorListeners.set(key, existing);
        },
      };
      await plugin.init(context);
    }
  }

  async destroyAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.destroy();
    }
  }

  getAction(pluginId: string, actionId: string): ActionDefinition | undefined {
    return this.actions.get(`${pluginId}.${actionId}`);
  }

  getStateProvider(
    pluginId: string,
    providerId: string,
  ): StateProviderDefinition | undefined {
    return this.stateProviders.get(`${pluginId}.${providerId}`);
  }

  getPreset(pluginId: string, presetId: string): ButtonPreset | undefined {
    return this.presets.get(`${pluginId}.${presetId}`);
  }

  /** Execute a fully-qualified action like "os-control.launch_app" */
  async executeAction(
    qualifiedId: string,
    params: unknown,
    context: Partial<ActionContext> = {},
  ): Promise<void> {
    const action = this.actions.get(qualifiedId);
    if (!action) throw new Error(`Action not found: ${qualifiedId}`);

    const fullContext: ActionContext = {
      targetAgent: context.targetAgent,
      focusedAgent: context.focusedAgent,
      triggerAction: async (pId, aId, p) => {
        await this.executeAction(`${pId}.${aId}`, p, context);
      },
    };

    await action.execute(params, fullContext);
  }

  /** Resolve a state provider to a ButtonStateResult */
  resolveState(qualifiedId: string, params: unknown) {
    const provider = this.stateProviders.get(qualifiedId);
    if (!provider) return undefined;
    return provider.resolve(params);
  }
}

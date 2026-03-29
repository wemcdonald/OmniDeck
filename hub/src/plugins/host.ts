import type {
  OmniDeckPlugin,
  PluginContext,
  ActionDefinition,
  StateProviderDefinition,
  StateProviderResult,
  ButtonPreset,
  ActionContext,
} from "./types.js";
import { extractFields, type PluginHealth, type CatalogField } from "@omnideck/plugin-schema";
import type { StateStore } from "../state/store.js";
import { createLogger } from "../logger.js";

type OrchestratorCallback = (data: unknown) => void;

const log = createLogger("plugin-host");

export class PluginHost {
  private plugins = new Map<string, OmniDeckPlugin>();
  private actions = new Map<string, ActionDefinition>(); // "pluginId.actionId"
  private stateProviders = new Map<string, StateProviderDefinition>();
  private presets = new Map<string, ButtonPreset>();
  private orchestratorListeners = new Map<string, OrchestratorCallback[]>();
  private pluginHealth = new Map<string, PluginHealth>();
  private store: StateStore;

  constructor(store: StateStore) {
    this.store = store;
  }

  register(plugin: OmniDeckPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  private createContext(id: string, config: unknown): PluginContext {
    return {
      config,
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
      setHealth: (health) => {
        this.pluginHealth.set(id, health);
      },
    };
  }

  async initAll(pluginConfigs: Record<string, unknown>): Promise<void> {
    for (const [id, plugin] of this.plugins) {
      await plugin.init(this.createContext(id, pluginConfigs[id] ?? {}));
    }
  }

  /** Initialize a single plugin (used for hot-loading after install). */
  async initPlugin(pluginId: string, config: unknown): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin not registered: ${pluginId}`);
    await plugin.init(this.createContext(pluginId, config));
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
    log.info({ action: qualifiedId, params, context }, `Executing ${qualifiedId}`);

    const action = this.actions.get(qualifiedId);
    if (!action) {
      log.warn({ action: qualifiedId, registered: Array.from(this.actions.keys()) }, "Action not found");
      throw new Error(`Action not found: ${qualifiedId}`);
    }

    const fullContext: ActionContext = {
      targetAgent: context.targetAgent,
      focusedAgent: context.focusedAgent,
      triggerAction: async (pId, aId, p) => {
        await this.executeAction(`${pId}.${aId}`, p, context);
      },
      resolveState: (qid, params) => this.resolveState(qid, params),
    };

    try {
      await action.execute(params, fullContext);
      log.info({ action: qualifiedId }, "Action executed successfully");
    } catch (err) {
      log.error({ action: qualifiedId, err }, "Action execution failed");
      throw err;
    }
  }

  getAllPresets(): Array<{ qualifiedId: string; pluginId: string; name: string; defaults: ButtonPreset["defaults"] }> {
    return Array.from(this.presets.entries()).map(([key, preset]) => ({
      qualifiedId: key,
      pluginId: key.split(".")[0],
      name: preset.name,
      defaults: preset.defaults,
    }));
  }

  getStatuses(): Array<{ id: string; name: string; version: string; icon?: string; status: string; health?: PluginHealth }> {
    return Array.from(this.plugins.values()).map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      icon: p.icon,
      status: "running",
      health: this.pluginHealth.get(p.id),
    }));
  }

  /** Resolve a state provider. Returns the new { state, variables } format. */
  resolveState(qualifiedId: string, params: unknown): StateProviderResult | undefined {
    const provider = this.stateProviders.get(qualifiedId);
    if (!provider) return undefined;
    return provider.resolve(params);
  }

  /** Get all registered actions (for catalog API). */
  getAllActions(): Array<{ qualifiedId: string; pluginId: string; action: ActionDefinition }> {
    return Array.from(this.actions.entries()).map(([key, action]) => ({
      qualifiedId: key,
      pluginId: key.split(".")[0],
      action,
    }));
  }

  /** Get all registered state providers (for catalog API). */
  getAllStateProviders(): Array<{ qualifiedId: string; pluginId: string; provider: StateProviderDefinition }> {
    return Array.from(this.stateProviders.entries()).map(([key, provider]) => ({
      qualifiedId: key,
      pluginId: key.split(".")[0],
      provider,
    }));
  }

  /** Get health status for a specific plugin. */
  getHealth(pluginId: string): PluginHealth | undefined {
    return this.pluginHealth.get(pluginId);
  }

  /** Build the full plugin catalog for the frontend. */
  getPluginCatalog(): PluginCatalog {
    const pluginMap = new Map<string, PluginCatalogEntry>();

    // Initialize entries from registered plugins
    for (const plugin of this.plugins.values()) {
      pluginMap.set(plugin.id, {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        icon: plugin.icon,
        health: this.pluginHealth.get(plugin.id) ?? { status: "ok" },
        presets: [],
        actions: [],
        stateProviders: [],
      });
    }

    // Populate actions
    for (const [key, action] of this.actions) {
      const pluginId = key.split(".")[0];
      const entry = pluginMap.get(pluginId);
      if (!entry) continue;

      entry.actions.push({
        qualifiedId: key,
        name: action.name,
        description: action.description,
        icon: action.icon,
        fields: action.paramsSchema ? extractFields(action.paramsSchema) : [],
      });
    }

    // Populate state providers
    for (const [key, provider] of this.stateProviders) {
      const pluginId = key.split(".")[0];
      const entry = pluginMap.get(pluginId);
      if (!entry) continue;

      entry.stateProviders.push({
        qualifiedId: key,
        name: provider.name,
        description: provider.description,
        icon: provider.icon,
        providesIcon: provider.providesIcon,
        templateVariables: provider.templateVariables,
        fields: provider.paramsSchema ? extractFields(provider.paramsSchema) : [],
      });
    }

    // Populate presets
    for (const [key, preset] of this.presets) {
      const pluginId = key.split(".")[0];
      const entry = pluginMap.get(pluginId);
      if (!entry) continue;

      entry.presets.push({
        qualifiedId: key,
        name: preset.name,
        description: preset.description,
        category: preset.category,
        icon: preset.icon ?? preset.defaults.icon,
        action: preset.action ? `${pluginId}.${preset.action}` : undefined,
        stateProvider: preset.stateProvider ? `${pluginId}.${preset.stateProvider}` : undefined,
        defaults: preset.defaults,
        longPressAction: preset.longPressAction ? `${pluginId}.${preset.longPressAction}` : undefined,
        longPressDefaults: preset.longPressDefaults,
      });
    }

    return { plugins: Array.from(pluginMap.values()) };
  }
}

// ── Catalog types (JSON-serializable for the API) ───────────────────────────

export interface PluginCatalog {
  plugins: PluginCatalogEntry[];
}

export interface PluginCatalogEntry {
  id: string;
  name: string;
  version: string;
  icon?: string;
  health: PluginHealth;
  presets: CatalogPreset[];
  actions: CatalogAction[];
  stateProviders: CatalogStateProvider[];
}

interface CatalogAction {
  qualifiedId: string;
  name: string;
  description?: string;
  icon?: string;
  fields: CatalogField[];
}

interface CatalogStateProvider {
  qualifiedId: string;
  name: string;
  description?: string;
  icon?: string;
  providesIcon?: boolean;
  templateVariables?: Array<{ key: string; label: string; example?: string }>;
  fields: CatalogField[];
}

interface CatalogPreset {
  qualifiedId: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  action?: string;
  stateProvider?: string;
  defaults: Record<string, unknown>;
  longPressAction?: string;
  longPressDefaults?: Record<string, unknown>;
}

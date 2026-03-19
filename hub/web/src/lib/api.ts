async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export interface ButtonConfig {
  pos: [number, number];
  label?: string;
  label_color?: string;
  top_label?: string;
  top_label_color?: string;
  icon?: string;
  icon_color?: string;
  background?: string;
  opacity?: number;
  action?: string;
  params?: Record<string, unknown>;
  state?: {
    provider: string;
    params?: Record<string, unknown>;
    when_true?: Partial<ButtonConfig>;
    when_false?: Partial<ButtonConfig>;
  };
  preset?: string;
  target?: string;
  long_press_action?: string;
  long_press_params?: Record<string, unknown>;
}

export interface PageConfig {
  page: string;
  name?: string;
  columns?: number;
  buttons: ButtonConfig[];
}

export interface PresetInfo {
  qualifiedId: string;
  pluginId: string;
  name: string;
  defaults: {
    action?: string;
    icon?: string;
    label?: string;
    background?: string;
    stateProvider?: string;
  };
}

// ── Plugin Catalog types (matches GET /api/status/plugin-catalog) ────────

export type { CatalogField } from "@omnideck/plugin-schema";
export type { PluginHealth } from "@omnideck/plugin-schema";
export type { TemplateVariable } from "@omnideck/plugin-schema";

export interface PluginCatalog {
  plugins: PluginCatalogEntry[];
}

export interface PluginCatalogEntry {
  id: string;
  name: string;
  version: string;
  icon?: string;
  health: import("@omnideck/plugin-schema").PluginHealth;
  presets: CatalogPreset[];
  actions: CatalogAction[];
  stateProviders: CatalogStateProvider[];
}

export interface CatalogAction {
  qualifiedId: string;
  name: string;
  description?: string;
  icon?: string;
  fields: import("@omnideck/plugin-schema").CatalogField[];
}

export interface CatalogStateProvider {
  qualifiedId: string;
  name: string;
  description?: string;
  icon?: string;
  providesIcon?: boolean;
  templateVariables?: import("@omnideck/plugin-schema").TemplateVariable[];
  fields: import("@omnideck/plugin-schema").CatalogField[];
}

export interface CatalogPreset {
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

export interface AgentState {
  hostname: string;
  platform: string;
  active_window_app?: string;
  idle_time_ms?: number;
  volume?: number;
  is_muted?: boolean;
  agent_version: string;
}

export const api = {
  pages: {
    list: () => request<PageConfig[]>("/api/config/pages"),
    get: (id: string) => request<PageConfig>(`/api/config/pages/${id}`),
    save: (id: string, page: PageConfig) =>
      request<{ ok: boolean }>(`/api/config/pages/${id}`, {
        method: "PUT",
        body: JSON.stringify(page),
      }),
    create: (page: PageConfig) =>
      request<{ ok: boolean }>("/api/config/pages", {
        method: "POST",
        body: JSON.stringify(page),
      }),
    preview: (id: string) =>
      request<Record<string, string>>(`/api/deck/preview/${id}`),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/config/pages/${id}`, { method: "DELETE" }),
  },
  plugins: {
    list: () => request<Record<string, unknown>>("/api/config/plugins"),
    save: (id: string, config: Record<string, unknown>) =>
      request<{ ok: boolean }>(`/api/config/plugins/${id}`, {
        method: "PUT",
        body: JSON.stringify(config),
      }),
  },
  raw: {
    get: (filename: string) =>
      request<{ content: string }>(`/api/config/raw/${filename}`),
    save: (filename: string, content: string) =>
      request<{ ok: boolean }>(`/api/config/raw/${filename}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      }),
  },
  status: {
    agents: () => request<AgentState[]>("/api/status/agents"),
    plugins: () =>
      request<Array<{ id: string; status: string; version: string; error?: string }>>(
        "/api/status/plugins"
      ),
    deckPreview: () => request<Record<number, string>>("/api/deck/preview"),
    presets: () => request<PresetInfo[]>("/api/status/presets"),
    pluginCatalog: () => request<PluginCatalog>("/api/status/plugin-catalog"),
  },
  deck: {
    press: (key: number) =>
      request<{ ok: boolean }>(`/api/deck/press/${key}`, { method: "POST" }),
  },
};

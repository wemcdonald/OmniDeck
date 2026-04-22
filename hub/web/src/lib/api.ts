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
  span?: boolean;
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
  configFields?: import("@omnideck/plugin-schema").CatalogField[];
  presets: CatalogPreset[];
  actions: CatalogAction[];
  stateProviders: CatalogStateProvider[];
  icons: CatalogPluginIcon[];
}

export interface CatalogPluginIcon {
  name: string;
  ref: string;
  url: string;
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

// ── Mode types ───────────────────────────────────────────────────────────

export interface ModeCheck {
  provider: string;
  params?: Record<string, unknown>;
  attribute: string;
  target?: string;
  not?: boolean;
  equals?: string | number | boolean;
  not_equals?: string | number | boolean;
  in?: (string | number)[];
  not_in?: (string | number)[];
  greater_than?: number;
  less_than?: number;
  contains?: string;
  matches?: string;
}

export interface ModeRule {
  condition: "and" | "or";
  checks: ModeCheck[];
}

export interface ModeAction {
  switch_page?: string;
  trigger_action?: string;
  params?: Record<string, unknown>;
}

export interface ModeConfig {
  name: string;
  icon?: string;
  priority?: number;
  rules: ModeRule[];
  on_enter?: ModeAction[];
  on_exit?: ModeAction[];
}

export interface CheckResult {
  provider: string;
  attribute: string;
  actualValue: unknown;
  comparator: string;
  expectedValue: unknown;
  passes: boolean;
  providerFound: boolean;
  negated: boolean;
}

export interface RuleResult {
  condition: "and" | "or";
  checks: CheckResult[];
  passes: boolean;
}

export interface ModeEvalResult {
  id: string;
  name: string;
  priority: number;
  rules: RuleResult[];
  active: boolean;
}

export interface ModeHistoryEntry {
  from: string | null;
  to: string | null;
  timestamp: string;
}

// ── Plugin Install types ─────────────────────────────────────────────────

export interface BrowsePlugin {
  id: string;
  name: string;
  description?: string;
  version: string;
  platforms: string[];
  dirName: string;
  icon?: string;
  category?: string;
  setup_steps?: string[];
}

export interface InstallResult {
  status: "installed" | "conflict" | "error";
  plugin?: { id: string; name: string; version: string };
  installed?: { version: string };
  incoming?: { version: string };
  errors?: string[];
}

export interface ValidateResult {
  status: "valid" | "error";
  manifest?: {
    id: string;
    name: string;
    description?: string;
    version: string;
    platforms: string[];
    hub?: string;
    agent?: string;
  };
  errors?: string[];
}

export interface ActiveModeInfo {
  id: string | null;
  name: string | null;
  icon: string | null;
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

export interface DisplaySegmentInfo {
  id: number;
  x: number; y: number;
  width: number; height: number;
}

export interface DisplayAreaInfo {
  id: string;
  pixelWidth: number;
  pixelHeight: number;
  col: number;
  rows: number;
  supportsInput: boolean;
  supportsRegionalWrite: boolean;
  segments: DisplaySegmentInfo[];
}

export interface DeckInfo {
  driver: string;
  model: string;
  keyCount: number;
  keyColumns: number;
  keySize: { width: number; height: number };
  capabilities: {
    hasKeyUp: boolean;
    hasHardwareLongPress: boolean;
    hasDisplay: boolean;
  };
  displayAreas: DisplayAreaInfo[];
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
  deck: {
    get: () => request<Record<string, unknown>>("/api/config/deck"),
    setDefaultPage: (pageId: string) =>
      request<{ ok: boolean }>("/api/config/deck", {
        method: "PUT",
        body: JSON.stringify({ default_page: pageId }),
      }),
    press: (key: number) =>
      request<{ ok: boolean }>(`/api/deck/press/${key}`, { method: "POST" }),
  },
  plugins: {
    list: () => request<{ plugins: Record<string, unknown>; secretRefs: Record<string, string[]> }>("/api/config/plugins"),
    save: (id: string, config: Record<string, unknown>) =>
      request<{ ok: boolean }>(`/api/config/plugins/${id}`, {
        method: "PUT",
        body: JSON.stringify(config),
      }),
    browse: () => request<{ plugins: BrowsePlugin[] }>("/api/plugins/browse"),
    installFromGitHub: (url: string, overwrite = false) =>
      request<InstallResult>("/api/plugins/install/github", {
        method: "POST",
        body: JSON.stringify({ url, overwrite }),
      }),
    installFromZip: async (file: File, overwrite = false) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `/api/plugins/install/zip${overwrite ? "?overwrite=true" : ""}`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ status: "error", errors: [res.statusText] }));
        return err as InstallResult;
      }
      return res.json() as Promise<InstallResult>;
    },
    validateGitHub: (url: string) =>
      request<ValidateResult>("/api/plugins/validate/github", {
        method: "POST",
        body: JSON.stringify({ url }),
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
  modes: {
    list: () => request<Record<string, ModeConfig>>("/api/config/modes"),
    saveAll: (modes: Record<string, ModeConfig>) =>
      request<{ ok: boolean }>("/api/config/modes", {
        method: "PUT",
        body: JSON.stringify(modes),
      }),
    save: (id: string, mode: ModeConfig) =>
      request<{ ok: boolean }>(`/api/config/modes/${id}`, {
        method: "PUT",
        body: JSON.stringify(mode),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/config/modes/${id}`, { method: "DELETE" }),
  },
  status: {
    deck: () => request<DeckInfo>("/api/status/deck"),
    agents: () => request<AgentState[]>("/api/status/agents"),
    plugins: () =>
      request<Array<{ id: string; status: string; version: string; error?: string }>>(
        "/api/status/plugins"
      ),
    deckPreview: () => request<{ images: Record<number, string>; displayAreaImages: Record<string, string> }>("/api/deck/preview"),
    presets: () => request<PresetInfo[]>("/api/status/presets"),
    pluginCatalog: () => request<PluginCatalog>("/api/status/plugin-catalog"),
    activeMode: () => request<ActiveModeInfo>("/api/status/active-mode"),
    debugModes: () => request<ModeEvalResult[]>("/api/status/modes/debug"),
    modeHistory: () => request<ModeHistoryEntry[]>("/api/status/modes/history"),
    modeOverride: () => request<{ override: string | null }>("/api/status/modes/override"),
    telemetry: () =>
      request<{
        rss_mb: number;
        heap_used_mb: number;
        heap_total_mb: number;
        ws_connections: number;
        agent_connections: number;
        uptime_seconds: number;
      }>("/api/status/telemetry"),
    system: () =>
      request<{
        cpu_percent: number;
        cpu_count: number;
        ram_total_mb: number;
        ram_used_mb: number;
        ram_percent: number;
        device_ip: string;
        uptime: string;
        uptime_seconds: number;
      }>("/api/status/system"),
  },
  auth: {
    status: () => request<{ auth_required: boolean; authenticated: boolean }>("/api/auth/status"),
    login: (password: string) =>
      request<{ ok: boolean }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  },
  pairing: {
    generateCode: () =>
      request<{ code: string; expires_at: string }>("/api/pairing/code", { method: "POST" }),
    listAgents: () =>
      request<Array<{
        agent_id: string;
        name: string;
        platform: string;
        paired_at: string;
        last_seen?: string;
      }>>("/api/pairing/agents"),
    revokeAgent: (id: string) =>
      request<{ ok: boolean }>(`/api/pairing/agents/${id}`, { method: "DELETE" }),
  },
  setup: {
    state: () => request<NetworkStateResponse>("/api/setup/state"),
    scan: () => request<{ networks: WifiNetwork[] }>("/api/setup/scan"),
    connect: (input: { ssid: string; password: string }) =>
      request<{ ok: boolean; error?: string }>("/api/setup/connect", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },
};

export interface NetworkStateResponse {
  mode: "client" | "ap" | "connecting" | "offline" | "unavailable";
  ssid: string | null;
  ip: string | null;
  nmAvailable: boolean;
  setup_ssid: string;
}

export interface WifiNetwork {
  ssid: string;
  signal: number;
  security: string;
  inUse: boolean;
}

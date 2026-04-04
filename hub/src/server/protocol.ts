export interface WsMessage {
  v: 1;
  type: string;
  id?: string;
  data: unknown;
  ts: string;
}

export interface CommandRequestData {
  command: string;
  params: Record<string, unknown>;
}

export interface CommandResponseData {
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface AgentStateData {
  hostname: string;
  device_name?: string;
  platform: string;
  active_window_title?: string;
  active_window_app?: string;
  agent_version: string;
  idle_time_ms?: number;
  volume?: number;
  mic_volume?: number;
  is_muted?: boolean;
  mic_muted?: boolean;
  mac_addresses?: string[];
}

export interface PairRequestData {
  hostname: string;
  device_name?: string;
  platform: string;
  agent_version: string;
  pairing_code: string;
}

export interface PairResponseData {
  success: boolean;
  agent_id?: string;
  token?: string;
  ca_cert?: string;
  ca_fingerprint?: string;
  hub_name?: string;
  error?: string;
}

export interface AuthenticateData {
  agent_id: string;
  token: string;
}

export interface AuthenticateResponseData {
  success: boolean;
  error?: string;
}

export function createMessage(type: string, data: unknown, id?: string): WsMessage {
  return {
    v: 1,
    type,
    id,
    data,
    ts: new Date().toISOString(),
  };
}

export function parseMessage(raw: string): WsMessage {
  const msg = JSON.parse(raw) as WsMessage;
  if (msg.v !== 1) throw new Error(`Unsupported protocol version: ${msg.v}`);
  return msg;
}

/** Hub → Agent: announce available plugins after agent hello */
export interface PluginManifestData {
  plugins: Array<{
    id: string;
    version: string;
    sha256: string;
    platforms: string[];
    hasAgent: boolean;
  }>;
}

/** Agent → Hub: request plugin code download */
export interface PluginDownloadRequestData {
  id: string;
}

/** Hub → Agent: plugin code bundle */
export interface PluginDownloadResponseData {
  id: string;
  code: string;
  sha256: string;
}

/** Agent → Hub: report plugin load status */
export interface PluginStatusData {
  plugins: Array<{
    id: string;
    version: string;
    status: "active" | "failed";
    error?: string;
  }>;
}

/** Hub → Agent: push updated plugin config */
export interface PluginConfigUpdateData {
  id: string;
  config: Record<string, unknown>;
}

/** Agent → Hub: forward plugin log entry */
export interface PluginLogData {
  hostname: string;
  pluginId: string;
  level: "debug" | "info" | "warn" | "error";
  msg: string;
  data?: Record<string, unknown>;
}

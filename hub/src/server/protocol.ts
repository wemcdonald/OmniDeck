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
  platform: string;
  agent_version: string;
  idle_time_ms?: number;
  volume?: number;
  mic_volume?: number;
  is_muted?: boolean;
  mic_muted?: boolean;
}

export interface PairRequestData {
  hostname: string;
  platform: string;
  agent_version: string;
  pairing_code: string;
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

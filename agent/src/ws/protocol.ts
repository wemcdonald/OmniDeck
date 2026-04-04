import { z } from "zod";

export interface WsMessage {
  v: 1;
  type: string;
  id?: string;
  data: unknown;
  ts: string;
}

// ── Incoming message payload schemas ─────────────────────────────────────────

export const PluginManifestSchema = z.object({
  plugins: z.array(z.object({
    id: z.string(),
    version: z.string(),
    sha256: z.string(),
  })),
});
export type PluginManifestData = z.infer<typeof PluginManifestSchema>;

export const CommandSchema = z.object({
  command: z.string(),
  params: z.record(z.unknown()).default({}),
});
export type CommandData = z.infer<typeof CommandSchema>;

export const PluginConfigUpdateSchema = z.object({
  id: z.string(),
  config: z.record(z.unknown()),
});
export type PluginConfigUpdateData = z.infer<typeof PluginConfigUpdateSchema>;

export const PluginDownloadResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  sha256: z.string(),
});
export type PluginDownloadResponseData = z.infer<typeof PluginDownloadResponseSchema>;

export function createMessage(type: string, data: unknown, id?: string): WsMessage {
  return { v: 1, type, id, data, ts: new Date().toISOString() };
}

export function parseMessage(raw: string): WsMessage {
  const msg = JSON.parse(raw) as WsMessage;
  if (msg.v !== 1) throw new Error(`Unsupported protocol version: ${msg.v}`);
  return msg;
}

export interface PairRequestData {
  hostname: string;
  device_name: string;
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

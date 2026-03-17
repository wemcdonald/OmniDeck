export interface WsMessage {
  v: 1;
  type: string;
  id?: string;
  data: unknown;
  ts: string;
}

export function createMessage(type: string, data: unknown, id?: string): WsMessage {
  return { v: 1, type, id, data, ts: new Date().toISOString() };
}

export function parseMessage(raw: string): WsMessage {
  const msg = JSON.parse(raw) as WsMessage;
  if (msg.v !== 1) throw new Error(`Unsupported protocol version: ${msg.v}`);
  return msg;
}

/** Default hub agent-WebSocket port. Mirrors hub.ts `agentPort` default. */
export const DEFAULT_HUB_PORT = 9210;

export function normalizeHubUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const stripped = trimmed.replace(/^(wss?|https?):\/\//i, "");
  const hasPort = /:\d+$/.test(stripped);
  return `wss://${stripped}${hasPort ? "" : `:${DEFAULT_HUB_PORT}`}`;
}

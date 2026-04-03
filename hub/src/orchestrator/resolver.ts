export interface AgentRoutingConfig {
  agent_order?: string[];
  plugins?: Record<string, { agent_order?: string[] }>;
}

interface StateReader {
  get(pluginId: string, key: string): unknown;
}

export interface RoutingContext {
  pluginId: string;
  explicitTarget?: string;
  state: StateReader;
  config: AgentRoutingConfig;
  connectedAgents: Set<string>;
}

export function resolveTarget(ctx: RoutingContext): string | null {
  // 1. Explicit pin on button
  if (ctx.explicitTarget && ctx.connectedAgents.has(ctx.explicitTarget)) {
    return ctx.explicitTarget;
  }

  // 2. Tier 1: plugin-reported active agent
  const activeAgent = ctx.state.get(ctx.pluginId, "active_agent") as string | undefined;
  if (activeAgent && ctx.connectedAgents.has(activeAgent)) {
    return activeAgent;
  }

  // 3. Tier 2: keyboard/mouse focus
  const focusedDevice = ctx.state.get("orchestrator", "focused_device") as string | undefined;
  if (focusedDevice && ctx.connectedAgents.has(focusedDevice)) {
    return focusedDevice;
  }

  // 4. Tier 3: config fallback order (per-plugin override, then global)
  const pluginOrder = ctx.config.plugins?.[ctx.pluginId]?.agent_order ?? ctx.config.agent_order ?? [];
  for (const agentId of pluginOrder) {
    if (ctx.connectedAgents.has(agentId)) return agentId;
  }

  return null;
}

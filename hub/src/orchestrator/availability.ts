import type { ButtonConfig } from "../config/validator.js";
import { resolveTarget, type AgentRoutingConfig } from "./resolver.js";

interface StateReader {
  get(pluginId: string, key: string): unknown;
}

export interface AvailabilityContext {
  connectedAgents: Set<string>;
  state: StateReader;
  routingConfig: AgentRoutingConfig;
  isAgentBackedPlugin: (pluginId: string) => boolean;
  /**
   * Some agent-backed builtins (sound, os-control) fall back to their own
   * `default_target` config when a button has no explicit target. That key is
   * unknown to resolveTarget, so the availability check has to look it up
   * separately. Return undefined if the plugin doesn't expose one.
   */
  pluginDefaultTarget?: (pluginId: string) => string | undefined;
}

function extractPluginId(ref: string | null | undefined): string | undefined {
  if (!ref) return undefined;
  const dot = ref.indexOf(".");
  return dot > 0 ? ref.slice(0, dot) : undefined;
}

function extractActionPluginIds(button: ButtonConfig): string[] {
  const ids = new Set<string>();
  for (const ref of [
    button.action,
    button.long_press_action,
    button.press_action,
    button.release_action,
    button.preset,
  ]) {
    const id = extractPluginId(ref);
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

/**
 * Decide whether a button is currently "available" — meaning a connected
 * agent exists that can service at least one of its actions. Buttons bound
 * purely to hub-local plugins are always available.
 *
 * Multi-action rule: if any action is hub-local, the button stays
 * available. Only if every action is agent-backed with no reachable agent
 * do we report unavailable.
 */
export function isButtonAvailable(
  button: ButtonConfig,
  ctx: AvailabilityContext,
): boolean {
  const pluginIds = extractActionPluginIds(button);
  if (pluginIds.length === 0) return true;

  const agentBackedIds: string[] = [];
  for (const id of pluginIds) {
    if (!ctx.isAgentBackedPlugin(id)) return true;
    agentBackedIds.push(id);
  }

  // All actions are agent-backed. A pinned button.target constrains every
  // action to that agent — one check suffices.
  if (button.target) {
    return ctx.connectedAgents.has(button.target);
  }

  for (const pluginId of agentBackedIds) {
    const target = resolveTarget({
      pluginId,
      state: ctx.state,
      config: ctx.routingConfig,
      connectedAgents: ctx.connectedAgents,
    });
    if (target !== null) return true;
    const fallback = ctx.pluginDefaultTarget?.(pluginId);
    if (fallback && ctx.connectedAgents.has(fallback)) return true;
  }
  return false;
}

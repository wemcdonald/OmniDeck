import { z } from "zod";
import { field } from "@omnideck/plugin-schema";
import type { OmniDeckPlugin, PluginContext } from "../../types.js";
import { HaClient } from "./client.js";
import { createHaActions } from "./actions.js";
import { createHaStateProviders } from "./state.js";
import { haPresets } from "./presets.js";
import { HaStatePublisher } from "./publisher.js";

interface HaConfig {
  url: string;
  token: string;
  reconnect?: boolean;
  /** State publishing config — pushes OmniDeck state TO Home Assistant */
  publish?: Record<string, unknown>;
}

// Module-level references for cleanup in destroy()
let activeClient: HaClient | null = null;
let activePublisher: HaStatePublisher | null = null;

const configSchema = z.object({
  url: field(z.string(), { label: "WebSocket URL", placeholder: "ws://homeassistant.local:8123/api/websocket" }),
  token: field(z.string(), { label: "Long-Lived Access Token" }),
});

export const homeAssistantPlugin: OmniDeckPlugin = {
  id: "home-assistant",
  configSchema,
  name: "Home Assistant",
  version: "2.0.0",
  icon: "ms:home",

  async init(ctx: PluginContext) {
    const config = ctx.config as HaConfig;

    // -- Create the HA WebSocket client --
    const client = new HaClient({
      url: config.url,
      token: config.token,
      log: ctx.log,
      reconnect: config.reconnect ?? true,
    });
    activeClient = client;

    // -- Bridge: HA entity state changes → state store --
    client.onStateChanged((entityId, newState) => {
      ctx.state.set("home-assistant", `entity:${entityId}`, {
        state: newState.state,
        attributes: newState.attributes,
      });
    });

    // -- Track HA connection status in the store --
    client.onConnection((connected) => {
      ctx.state.set("home-assistant", "connected", connected);
      ctx.state.set("home-assistant", "ha_version", client.version);
    });

    // -- Register actions --
    for (const action of createHaActions(client, ctx.state)) {
      ctx.registerAction(action);
    }

    // -- Register state providers --
    for (const provider of createHaStateProviders(ctx.state)) {
      ctx.registerStateProvider(provider);
    }

    // -- Register presets --
    for (const preset of haPresets) {
      ctx.registerPreset(preset);
    }

    // -- State publisher: OmniDeck orchestrator state → HA --
    const publisher = new HaStatePublisher(config.publish, ctx.state, client, ctx.log);
    activePublisher = publisher;
    if (publisher.enabled) {
      // Start publishing once connected to HA
      client.onConnection((connected) => {
        if (connected) {
          publisher.start();
        } else {
          publisher.stop();
        }
      });
    }

    // -- Cache entity registry for the web UI entity browser --
    let registryTimer: ReturnType<typeof setInterval> | null = null;

    async function refreshEntityRegistry() {
      try {
        const registry = await client.getEntityRegistry();
        ctx.state.set("home-assistant", "entity_registry", registry);
        ctx.log.debug({ count: registry.length }, "Cached HA entity registry");
      } catch (err) {
        ctx.log.warn({ err }, "Failed to fetch entity registry");
      }
    }

    client.onConnection(async (connected) => {
      if (registryTimer) { clearInterval(registryTimer); registryTimer = null; }
      if (!connected) return;
      await refreshEntityRegistry();
      // Refresh every 60s to pick up entity changes in HA
      registryTimer = setInterval(() => { refreshEntityRegistry(); }, 60_000);
    });

    // -- Connect (non-blocking, will reconnect on failure) --
    if (config.url && config.token) {
      ctx.setHealth({ status: "ok" });
      client.connect();
    } else {
      const missing = [!config.url && "url", !config.token && "token"].filter(Boolean).join(", ");
      ctx.setHealth({
        status: "misconfigured",
        message: `Missing: ${missing}`,
        configKey: "plugins.home-assistant",
        settingsUrl: "/settings/plugins/home-assistant",
      });
      ctx.log.warn("HA plugin: url or token not configured, skipping connection");
    }
  },

  async destroy() {
    if (activePublisher) {
      activePublisher.stop();
      activePublisher = null;
    }
    if (activeClient) {
      activeClient.destroy();
      activeClient = null;
    }
  },
};

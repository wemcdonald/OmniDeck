import type { OmniDeckPlugin, PluginContext } from "../../types.js";
import { createHaActions } from "./actions.js";
import { createEntityStateProvider } from "./state.js";
import { haPresets } from "./presets.js";
import WebSocket from "ws";

interface HaConfig {
  url: string;
  token: string;
}

export const homeAssistantPlugin: OmniDeckPlugin = {
  id: "home-assistant",
  name: "Home Assistant",
  version: "1.0.0",

  async init(ctx: PluginContext) {
    const config = ctx.config as HaConfig;
    let haWs: WebSocket | null = null;
    let msgId = 1;

    // HA service caller — no-ops when not connected
    const callService = async (
      domain: string,
      service: string,
      data: Record<string, unknown>,
    ): Promise<void> => {
      if (!haWs || haWs.readyState !== WebSocket.OPEN) {
        ctx.log.warn("HA not connected, cannot call service");
        return;
      }
      const id = msgId++;
      haWs.send(
        JSON.stringify({
          id,
          type: "call_service",
          domain,
          service,
          service_data: data,
        }),
      );
    };

    // Register actions, state provider, presets (always — even if HA is unreachable)
    for (const action of createHaActions(callService)) {
      ctx.registerAction(action);
    }
    ctx.registerStateProvider(createEntityStateProvider(ctx.state));
    for (const preset of haPresets) {
      ctx.registerPreset(preset);
    }

    // Connect to HA WebSocket — non-blocking, gracefully handles failure
    try {
      haWs = new WebSocket(config.url);

      haWs.on("open", () => {
        ctx.log.info("Connected to Home Assistant");
      });

      haWs.on("message", (raw) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        } catch {
          return;
        }

        if (msg.type === "auth_required") {
          haWs!.send(JSON.stringify({ type: "auth", access_token: config.token }));
        } else if (msg.type === "auth_ok") {
          ctx.log.info("HA authenticated");
          const subId = msgId++;
          haWs!.send(
            JSON.stringify({
              id: subId,
              type: "subscribe_events",
              event_type: "state_changed",
            }),
          );
        } else if (msg.type === "event") {
          const event = msg.event as
            | { event_type: string; data: { entity_id: string; new_state: unknown } }
            | undefined;
          if (event?.event_type === "state_changed" && event.data.new_state) {
            const newState = event.data.new_state as {
              state: string;
              attributes: Record<string, unknown>;
            };
            ctx.state.set("home-assistant", `entity:${event.data.entity_id}`, {
              state: newState.state,
              attributes: newState.attributes,
            });
          }
        }
      });

      haWs.on("error", (err: Error) => {
        ctx.log.warn(
          { err: err.message },
          "HA WebSocket error (will retry on next config reload)",
        );
      });
    } catch {
      ctx.log.warn("Could not connect to HA (will retry on config reload)");
    }
  },

  async destroy() {},
};

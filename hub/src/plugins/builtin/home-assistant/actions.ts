import type { ActionDefinition } from "../../types.js";
import type { HaClient } from "./client.js";

export function createHaActions(client: HaClient): ActionDefinition[] {
  return [
    // -- Generic service call --
    {
      id: "call_service",
      name: "Call Service",
      async execute(params) {
        const { domain, service, data, entity_id } = params as {
          domain: string;
          service: string;
          data?: Record<string, unknown>;
          entity_id?: string | string[];
        };
        const target = entity_id ? { entity_id } : undefined;
        await client.callService(domain, service, data, target);
      },
    },

    // -- Toggle any toggleable entity --
    {
      id: "toggle",
      name: "Toggle",
      async execute(params) {
        const { entity_id } = params as { entity_id: string };
        const domain = entity_id.split(".")[0] ?? "homeassistant";
        await client.callService(domain, "toggle", undefined, { entity_id });
      },
    },

    // -- Explicit on/off --
    {
      id: "turn_on",
      name: "Turn On",
      async execute(params) {
        const { entity_id, ...serviceData } = params as {
          entity_id: string;
          [k: string]: unknown;
        };
        const domain = entity_id.split(".")[0] ?? "homeassistant";
        const data = Object.keys(serviceData).length > 0 ? serviceData : undefined;
        await client.callService(domain, "turn_on", data, { entity_id });
      },
    },
    {
      id: "turn_off",
      name: "Turn Off",
      async execute(params) {
        const { entity_id } = params as { entity_id: string };
        const domain = entity_id.split(".")[0] ?? "homeassistant";
        await client.callService(domain, "turn_off", undefined, { entity_id });
      },
    },

    // -- Scene activation --
    {
      id: "run_scene",
      name: "Activate Scene",
      async execute(params) {
        const { scene_id } = params as { scene_id: string };
        // Normalize: accept "scene.movie_night" or just "movie_night"
        const entityId = scene_id.startsWith("scene.") ? scene_id : `scene.${scene_id}`;
        await client.callService("scene", "turn_on", undefined, { entity_id: entityId });
      },
    },

    // -- Script execution --
    {
      id: "run_script",
      name: "Run Script",
      async execute(params) {
        const { script_id, variables } = params as {
          script_id: string;
          variables?: Record<string, unknown>;
        };
        const entityId = script_id.startsWith("script.") ? script_id : `script.${script_id}`;
        await client.callService("script", "turn_on", variables, { entity_id: entityId });
      },
    },

    // -- Climate / thermostat --
    {
      id: "set_climate",
      name: "Set Climate",
      async execute(params) {
        const { entity_id, temperature, hvac_mode, target_temp_high, target_temp_low } =
          params as {
            entity_id: string;
            temperature?: number;
            hvac_mode?: string;
            target_temp_high?: number;
            target_temp_low?: number;
          };
        if (hvac_mode) {
          await client.callService("climate", "set_hvac_mode", { hvac_mode }, { entity_id });
        }
        const tempData: Record<string, unknown> = {};
        if (temperature !== undefined) tempData.temperature = temperature;
        if (target_temp_high !== undefined) tempData.target_temp_high = target_temp_high;
        if (target_temp_low !== undefined) tempData.target_temp_low = target_temp_low;
        if (Object.keys(tempData).length > 0) {
          await client.callService("climate", "set_temperature", tempData, { entity_id });
        }
      },
    },

    // -- Cover (blinds, garage doors) --
    {
      id: "set_cover",
      name: "Set Cover Position",
      async execute(params) {
        const { entity_id, position, command } = params as {
          entity_id: string;
          position?: number;
          command?: "open" | "close" | "stop";
        };
        if (command) {
          await client.callService("cover", `${command}_cover`, undefined, { entity_id });
        } else if (position !== undefined) {
          await client.callService("cover", "set_cover_position", { position }, { entity_id });
        } else {
          // Default: toggle
          await client.callService("cover", "toggle", undefined, { entity_id });
        }
      },
    },

    // -- Lock --
    {
      id: "lock",
      name: "Lock",
      async execute(params) {
        const { entity_id } = params as { entity_id: string };
        await client.callService("lock", "lock", undefined, { entity_id });
      },
    },
    {
      id: "unlock",
      name: "Unlock",
      async execute(params) {
        const { entity_id } = params as { entity_id: string };
        await client.callService("lock", "unlock", undefined, { entity_id });
      },
    },
    {
      id: "toggle_lock",
      name: "Toggle Lock",
      async execute(params) {
        const { entity_id, current_state } = params as {
          entity_id: string;
          current_state?: string;
        };
        const service = current_state === "locked" ? "unlock" : "lock";
        await client.callService("lock", service, undefined, { entity_id });
      },
    },

    // -- Media player --
    {
      id: "media_play_pause",
      name: "Media Play/Pause",
      async execute(params) {
        const { entity_id } = params as { entity_id: string };
        await client.callService("media_player", "media_play_pause", undefined, { entity_id });
      },
    },
    {
      id: "media_next",
      name: "Media Next Track",
      async execute(params) {
        const { entity_id } = params as { entity_id: string };
        await client.callService("media_player", "media_next_track", undefined, { entity_id });
      },
    },
    {
      id: "media_volume_set",
      name: "Media Set Volume",
      async execute(params) {
        const { entity_id, volume_level } = params as {
          entity_id: string;
          volume_level: number;
        };
        await client.callService("media_player", "volume_set", { volume_level }, { entity_id });
      },
    },

    // -- Fan --
    {
      id: "set_fan_speed",
      name: "Set Fan Speed",
      async execute(params) {
        const { entity_id, percentage } = params as {
          entity_id: string;
          percentage: number;
        };
        await client.callService("fan", "set_percentage", { percentage }, { entity_id });
      },
    },

    // -- Fire custom event --
    {
      id: "fire_event",
      name: "Fire Event",
      async execute(params) {
        const { event_type, event_data } = params as {
          event_type: string;
          event_data?: Record<string, unknown>;
        };
        await client.fireEvent(event_type, event_data);
      },
    },

    // -- Input helpers --
    {
      id: "set_input",
      name: "Set Input Helper",
      async execute(params) {
        const { entity_id, value } = params as {
          entity_id: string;
          value: unknown;
        };
        const domain = entity_id.split(".")[0];
        switch (domain) {
          case "input_boolean":
            await client.callService(
              "input_boolean",
              value ? "turn_on" : "turn_off",
              undefined,
              { entity_id },
            );
            break;
          case "input_number":
            await client.callService("input_number", "set_value", { value }, { entity_id });
            break;
          case "input_select":
            await client.callService("input_select", "select_option", { option: value }, { entity_id });
            break;
          case "input_text":
            await client.callService("input_text", "set_value", { value }, { entity_id });
            break;
          case "input_datetime":
            await client.callService("input_datetime", "set_datetime", { datetime: value }, { entity_id });
            break;
          default:
            throw new Error(`Unsupported input domain: ${domain}`);
        }
      },
    },
  ];
}

import { z } from "zod";
import { field } from "@omnideck/plugin-schema";
import type { ActionDefinition } from "../../types.js";
import type { HaClient } from "./client.js";
import type { StateStore } from "../../../state/store.js";

// ── Shared helpers ───────────────────────────────────────────────────────────

const entityId = (label: string, domain?: string) =>
  field(z.string(), { label, fieldType: "ha_entity", ...(domain ? { domain } : {}) });

const optionalRecord = (label: string) =>
  field(z.record(z.unknown()).optional(), { label });

// ── Schemas ──────────────────────────────────────────────────────────────────

const callServiceSchema = z.object({
  domain: field(z.string(), { label: "Domain", placeholder: "light" }),
  service: field(z.string(), { label: "Service", placeholder: "turn_on" }),
  data: optionalRecord("Service Data"),
  entity_id: field(
    z.union([z.string(), z.array(z.string())]).optional(),
    { label: "Entity", fieldType: "ha_entity" },
  ),
});

const toggleSchema = z.object({
  entity_id: entityId("Entity"),
});

const turnOnSchema = z.object({
  entity_id: entityId("Entity"),
});

const turnOffSchema = z.object({
  entity_id: entityId("Entity"),
});

const runSceneSchema = z.object({
  scene_id: entityId("Scene", "scene"),
});

const runScriptSchema = z.object({
  script_id: entityId("Script", "script"),
  variables: optionalRecord("Variables"),
});

const setClimateSchema = z.object({
  entity_id: entityId("Climate Entity", "climate"),
  temperature: field(z.number().optional(), { label: "Temperature" }),
  hvac_mode: field(z.string().optional(), { label: "HVAC Mode", placeholder: "heat" }),
  target_temp_high: field(z.number().optional(), { label: "Target Temp High" }),
  target_temp_low: field(z.number().optional(), { label: "Target Temp Low" }),
});

const setCoverSchema = z.object({
  entity_id: entityId("Cover Entity", "cover"),
  position: field(z.number().min(0).max(100).optional(), { label: "Position (0–100)" }),
  command: field(z.enum(["open", "close", "stop"]).optional(), { label: "Command" }),
});

const lockSchema = z.object({
  entity_id: entityId("Lock Entity", "lock"),
});

const unlockSchema = z.object({
  entity_id: entityId("Lock Entity", "lock"),
});

const toggleLockSchema = z.object({
  entity_id: entityId("Lock Entity", "lock"),
  current_state: field(z.string().optional(), { label: "Current State" }),
});

const mediaPlayPauseSchema = z.object({
  entity_id: entityId("Media Player", "media_player"),
});

const mediaNextSchema = z.object({
  entity_id: entityId("Media Player", "media_player"),
});

const mediaVolumeSetSchema = z.object({
  entity_id: entityId("Media Player", "media_player"),
  volume_level: field(z.number().min(0).max(1), { label: "Volume Level (0–1)" }),
});

const setFanSpeedSchema = z.object({
  entity_id: entityId("Fan Entity", "fan"),
  percentage: field(z.number().min(0).max(100), { label: "Speed (%)" }),
});

const fireEventSchema = z.object({
  event_type: field(z.string(), { label: "Event Type", placeholder: "custom_event" }),
  event_data: optionalRecord("Event Data"),
});

const setInputSchema = z.object({
  entity_id: entityId("Input Entity"),
  value: field(z.unknown(), { label: "Value" }),
});

// ── Actions ──────────────────────────────────────────────────────────────────

export function createHaActions(client: HaClient, store?: StateStore): ActionDefinition[] {
  /** Optimistically update the store after a service call so buttons re-render immediately. */
  function optimisticUpdate(domain: string, service: string, entityId: string | string[] | undefined, data?: Record<string, unknown>) {
    if (!store || !entityId || Array.isArray(entityId)) return;
    const storeKey = `entity:${entityId}`;
    const current = store.get("home-assistant", storeKey) as { state: string; attributes: Record<string, unknown> } | undefined;
    if (!current) return;

    if (domain === "select" && service === "select_next") {
      const options = (current.attributes.options as string[]) ?? [];
      const idx = options.indexOf(current.state);
      if (idx !== -1 && options.length > 1) {
        const next = options[(idx + 1) % options.length];
        store.set("home-assistant", storeKey, { ...current, state: next });
      }
    } else if (domain === "select" && service === "select_previous") {
      const options = (current.attributes.options as string[]) ?? [];
      const idx = options.indexOf(current.state);
      if (idx !== -1 && options.length > 1) {
        const next = options[(idx - 1 + options.length) % options.length];
        store.set("home-assistant", storeKey, { ...current, state: next });
      }
    } else if (domain === "select" && service === "select_option" && data?.option) {
      store.set("home-assistant", storeKey, { ...current, state: data.option as string });
    }
  }

  return [
    // -- Generic service call --
    {
      id: "call_service",
      name: "Call Service",
      description: "Call any Home Assistant service with optional entity target.",
      icon: "ms:build",
      paramsSchema: callServiceSchema,
      async execute(params) {
        const { domain, service, data, entity_id } = callServiceSchema.parse(params);
        const target = entity_id ? { entity_id } : undefined;
        await client.callService(domain, service, data, target);
        optimisticUpdate(domain, service, entity_id, data as Record<string, unknown> | undefined);
      },
    },

    // -- Toggle any toggleable entity --
    {
      id: "toggle",
      name: "Toggle",
      description: "Toggle any switchable entity on or off.",
      icon: "ms:toggle_on",
      paramsSchema: toggleSchema,
      async execute(params) {
        const { entity_id } = toggleSchema.parse(params);
        const domain = entity_id.split(".")[0] ?? "homeassistant";
        await client.callService(domain, "toggle", undefined, { entity_id });
      },
    },

    // -- Explicit on/off --
    {
      id: "turn_on",
      name: "Turn On",
      description: "Turn on an entity, with optional service data (e.g. brightness).",
      icon: "ms:power",
      paramsSchema: turnOnSchema,
      async execute(params) {
        const { entity_id, ...serviceData } = turnOnSchema.passthrough().parse(params) as {
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
      description: "Turn off an entity.",
      icon: "ms:power_off",
      paramsSchema: turnOffSchema,
      async execute(params) {
        const { entity_id } = turnOffSchema.parse(params);
        const domain = entity_id.split(".")[0] ?? "homeassistant";
        await client.callService(domain, "turn_off", undefined, { entity_id });
      },
    },

    // -- Scene activation --
    {
      id: "run_scene",
      name: "Activate Scene",
      description: "Activate a Home Assistant scene.",
      icon: "ms:palette",
      paramsSchema: runSceneSchema,
      async execute(params) {
        const { scene_id } = runSceneSchema.parse(params);
        const entityId = scene_id.startsWith("scene.") ? scene_id : `scene.${scene_id}`;
        await client.callService("scene", "turn_on", undefined, { entity_id: entityId });
      },
    },

    // -- Script execution --
    {
      id: "run_script",
      name: "Run Script",
      description: "Execute a Home Assistant script with optional variables.",
      icon: "ms:description",
      paramsSchema: runScriptSchema,
      async execute(params) {
        const { script_id, variables } = runScriptSchema.parse(params);
        const entityId = script_id.startsWith("script.") ? script_id : `script.${script_id}`;
        await client.callService("script", "turn_on", variables, { entity_id: entityId });
      },
    },

    // -- Climate / thermostat --
    {
      id: "set_climate",
      name: "Set Climate",
      description: "Adjust thermostat temperature and HVAC mode.",
      icon: "ms:thermostat",
      paramsSchema: setClimateSchema,
      async execute(params) {
        const { entity_id, temperature, hvac_mode, target_temp_high, target_temp_low } =
          setClimateSchema.parse(params);
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
      description: "Control cover position or send open/close/stop command.",
      icon: "ms:blinds",
      paramsSchema: setCoverSchema,
      async execute(params) {
        const { entity_id, position, command } = setCoverSchema.parse(params);
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
      description: "Lock a lock entity.",
      icon: "ms:lock",
      paramsSchema: lockSchema,
      async execute(params) {
        const { entity_id } = lockSchema.parse(params);
        await client.callService("lock", "lock", undefined, { entity_id });
      },
    },
    {
      id: "unlock",
      name: "Unlock",
      description: "Unlock a lock entity.",
      icon: "ms:lock_open",
      paramsSchema: unlockSchema,
      async execute(params) {
        const { entity_id } = unlockSchema.parse(params);
        await client.callService("lock", "unlock", undefined, { entity_id });
      },
    },
    {
      id: "toggle_lock",
      name: "Toggle Lock",
      description: "Toggle a lock between locked and unlocked states.",
      icon: "ms:lock",
      paramsSchema: toggleLockSchema,
      async execute(params) {
        const { entity_id, current_state } = toggleLockSchema.parse(params);
        const service = current_state === "locked" ? "unlock" : "lock";
        await client.callService("lock", service, undefined, { entity_id });
      },
    },

    // -- Media player --
    {
      id: "media_play_pause",
      name: "Media Play/Pause",
      description: "Toggle play/pause on a media player.",
      icon: "ms:play_circle",
      paramsSchema: mediaPlayPauseSchema,
      async execute(params) {
        const { entity_id } = mediaPlayPauseSchema.parse(params);
        await client.callService("media_player", "media_play_pause", undefined, { entity_id });
      },
    },
    {
      id: "media_next",
      name: "Media Next Track",
      description: "Skip to the next track on a media player.",
      icon: "ms:skip_next",
      paramsSchema: mediaNextSchema,
      async execute(params) {
        const { entity_id } = mediaNextSchema.parse(params);
        await client.callService("media_player", "media_next_track", undefined, { entity_id });
      },
    },
    {
      id: "media_volume_set",
      name: "Media Set Volume",
      description: "Set the volume level on a media player.",
      icon: "ms:volume_up",
      paramsSchema: mediaVolumeSetSchema,
      async execute(params) {
        const { entity_id, volume_level } = mediaVolumeSetSchema.parse(params);
        await client.callService("media_player", "volume_set", { volume_level }, { entity_id });
      },
    },

    // -- Fan --
    {
      id: "set_fan_speed",
      name: "Set Fan Speed",
      description: "Set a fan entity speed percentage.",
      icon: "ms:mode_fan",
      paramsSchema: setFanSpeedSchema,
      async execute(params) {
        const { entity_id, percentage } = setFanSpeedSchema.parse(params);
        await client.callService("fan", "set_percentage", { percentage }, { entity_id });
      },
    },

    // -- Fire custom event --
    {
      id: "fire_event",
      name: "Fire Event",
      description: "Fire a custom event on the Home Assistant event bus.",
      icon: "ms:bolt",
      paramsSchema: fireEventSchema,
      async execute(params) {
        const { event_type, event_data } = fireEventSchema.parse(params);
        await client.fireEvent(event_type, event_data);
      },
    },

    // -- Input helpers --
    {
      id: "set_input",
      name: "Set Input Helper",
      description: "Set the value of an input_* helper entity.",
      icon: "ms:tune",
      paramsSchema: setInputSchema,
      async execute(params) {
        const { entity_id, value } = setInputSchema.parse(params);
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

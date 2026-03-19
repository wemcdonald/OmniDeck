import type { StateProviderDefinition, ButtonStateResult } from "../../types.js";
import type { StateStore } from "../../../state/store.js";

interface EntityState {
  state: string;
  attributes: Record<string, unknown>;
}

// -- Domain defaults for icons, colors, labels --

const DOMAIN_ICONS: Record<string, string> = {
  light: "mdi:lightbulb",
  switch: "mdi:power",
  fan: "mdi:fan",
  lock: "mdi:lock",
  cover: "mdi:blinds",
  binary_sensor: "mdi:eye",
  sensor: "mdi:chart-line",
  climate: "mdi:thermostat",
  media_player: "mdi:play-circle",
  scene: "mdi:palette",
  script: "mdi:script-text",
  automation: "mdi:robot",
  vacuum: "mdi:robot-vacuum",
  camera: "mdi:camera",
  input_boolean: "mdi:toggle-switch",
  input_number: "mdi:ray-vertex",
  input_select: "mdi:form-dropdown",
};

const DOMAIN_ON_BG: Record<string, string> = {
  light: "#92400e",
  switch: "#065f46",
  fan: "#1e3a5f",
  lock: "#991b1b",     // locked = red
  cover: "#1e3a5f",
  binary_sensor: "#92400e",
  input_boolean: "#065f46",
};

const DOMAIN_OFF_BG = "#374151";

function getDomain(entityId: string): string {
  return entityId.split(".")[0] ?? "unknown";
}

function getEntity(store: StateStore, entityId: string): EntityState | undefined {
  return store.get("home-assistant", `entity:${entityId}`) as EntityState | undefined;
}

// -- Generic entity state (works for any domain) --

function resolveGenericEntity(entity: EntityState, domain: string): ButtonStateResult {
  const isOn = entity.state === "on";
  const result: ButtonStateResult = {
    icon: DOMAIN_ICONS[domain],
    label: entity.state,
    background: isOn ? (DOMAIN_ON_BG[domain] ?? "#065f46") : DOMAIN_OFF_BG,
  };

  if (!isOn && domain !== "sensor" && domain !== "climate" && domain !== "media_player") {
    result.opacity = 0.7;
  }

  // Friendly name override for label
  if (typeof entity.attributes.friendly_name === "string") {
    result.topLabel = entity.attributes.friendly_name;
  }

  return result;
}

// -- Specialized providers --

function resolveLightState(entity: EntityState): ButtonStateResult {
  const isOn = entity.state === "on";
  const brightness = typeof entity.attributes.brightness === "number"
    ? Math.round((entity.attributes.brightness / 255) * 100)
    : undefined;

  const result: ButtonStateResult = {
    icon: "mdi:lightbulb",
    background: isOn ? "#92400e" : DOMAIN_OFF_BG,
    opacity: isOn ? 1 : 0.6,
  };

  if (isOn && brightness !== undefined) {
    result.label = `${brightness}%`;
    result.progress = brightness / 100;
  } else {
    result.label = isOn ? "On" : "Off";
  }

  // Match icon color to the light's actual color if available
  if (isOn && entity.attributes.rgb_color) {
    const [r, g, b] = entity.attributes.rgb_color as [number, number, number];
    result.background = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  return result;
}

function resolveClimateState(entity: EntityState): ButtonStateResult {
  const hvacMode = entity.state; // "heat", "cool", "heat_cool", "off", "auto", "dry", "fan_only"
  const currentTemp = entity.attributes.current_temperature as number | undefined;
  const targetTemp = entity.attributes.temperature as number | undefined;
  const unit = (entity.attributes.unit_of_measurement as string) ?? "°";

  let background = DOMAIN_OFF_BG;
  let icon = "mdi:thermostat";
  if (hvacMode === "heat" || hvacMode === "heat_cool") {
    background = "#92400e";
    icon = "mdi:fire";
  } else if (hvacMode === "cool") {
    background = "#1e3a5f";
    icon = "mdi:snowflake";
  } else if (hvacMode === "auto") {
    background = "#065f46";
  }

  const hvacAction = entity.attributes.hvac_action as string | undefined;
  if (hvacAction === "heating") background = "#b45309";
  else if (hvacAction === "cooling") background = "#0369a1";
  else if (hvacAction === "idle") background = "#374151";

  return {
    icon,
    background,
    label: currentTemp !== undefined ? `${currentTemp}${unit}` : hvacMode,
    topLabel: targetTemp !== undefined ? `→ ${targetTemp}${unit}` : undefined,
  };
}

function resolveMediaPlayerState(entity: EntityState): ButtonStateResult {
  const isPlaying = entity.state === "playing";
  const isPaused = entity.state === "paused";
  const title = entity.attributes.media_title as string | undefined;
  const app = entity.attributes.app_name as string | undefined;

  let icon = "mdi:play-circle";
  if (isPlaying) icon = "mdi:pause-circle";
  else if (isPaused) icon = "mdi:play-circle";
  else icon = "mdi:stop-circle";

  return {
    icon,
    background: isPlaying ? "#065f46" : isPaused ? "#374151" : DOMAIN_OFF_BG,
    label: title ?? entity.state,
    topLabel: app,
    opacity: entity.state === "off" || entity.state === "unavailable" ? 0.5 : 1,
  };
}

function resolveSensorValue(entity: EntityState): ButtonStateResult {
  const value = entity.state;
  const unit = entity.attributes.unit_of_measurement as string | undefined;
  const deviceClass = entity.attributes.device_class as string | undefined;

  let icon = DOMAIN_ICONS.sensor;
  if (deviceClass === "temperature") icon = "mdi:thermometer";
  else if (deviceClass === "humidity") icon = "mdi:water-percent";
  else if (deviceClass === "battery") icon = "mdi:battery";
  else if (deviceClass === "power" || deviceClass === "energy") icon = "mdi:flash";
  else if (deviceClass === "pressure") icon = "mdi:gauge";
  else if (deviceClass === "illuminance") icon = "mdi:brightness-6";
  else if (deviceClass === "motion" || deviceClass === "occupancy") icon = "mdi:motion-sensor";

  const result: ButtonStateResult = {
    icon,
    label: unit ? `${value} ${unit}` : value,
  };

  // Battery: show progress bar and color-code
  if (deviceClass === "battery") {
    const pct = parseFloat(value);
    if (!isNaN(pct)) {
      result.progress = pct / 100;
      if (pct <= 20) result.badgeColor = "#ef4444";
      else if (pct <= 50) result.badgeColor = "#f59e0b";
    }
  }

  return result;
}

function resolveCoverState(entity: EntityState): ButtonStateResult {
  const position = entity.attributes.current_position as number | undefined;
  const isOpen = entity.state === "open";
  const isClosed = entity.state === "closed";

  let icon = "mdi:blinds";
  if (entity.attributes.device_class === "garage") {
    icon = isOpen ? "mdi:garage-open" : "mdi:garage";
  } else if (isClosed) {
    icon = "mdi:blinds-horizontal-closed";
  }

  return {
    icon,
    background: isOpen ? "#1e3a5f" : DOMAIN_OFF_BG,
    label: position !== undefined ? `${position}%` : entity.state,
    progress: position !== undefined ? position / 100 : undefined,
    opacity: isClosed ? 0.7 : 1,
  };
}

function resolveLockState(entity: EntityState): ButtonStateResult {
  const isLocked = entity.state === "locked";
  return {
    icon: isLocked ? "mdi:lock" : "mdi:lock-open",
    background: isLocked ? "#991b1b" : "#065f46",
    label: isLocked ? "Locked" : "Unlocked",
  };
}

function resolveFanState(entity: EntityState): ButtonStateResult {
  const isOn = entity.state === "on";
  const pct = entity.attributes.percentage as number | undefined;

  return {
    icon: "mdi:fan",
    background: isOn ? "#1e3a5f" : DOMAIN_OFF_BG,
    label: isOn && pct !== undefined ? `${pct}%` : isOn ? "On" : "Off",
    progress: isOn && pct !== undefined ? pct / 100 : undefined,
    opacity: isOn ? 1 : 0.6,
  };
}

// -- Provider factories --

export function createHaStateProviders(store: StateStore): StateProviderDefinition[] {
  return [
    {
      id: "entity_state",
      resolve(params): ButtonStateResult {
        const { entity_id } = params as { entity_id: string };
        if (!entity_id) return { label: "?" };

        const entity = getEntity(store, entity_id);
        if (!entity) return { label: "...", opacity: 0.4 };

        const domain = getDomain(entity_id);
        return resolveGenericEntity(entity, domain);
      },
    },
    {
      id: "light_state",
      resolve(params): ButtonStateResult {
        const { entity_id } = params as { entity_id: string };
        const entity = getEntity(store, entity_id);
        if (!entity) return { icon: "mdi:lightbulb", label: "...", opacity: 0.4 };
        return resolveLightState(entity);
      },
    },
    {
      id: "climate_state",
      resolve(params): ButtonStateResult {
        const { entity_id } = params as { entity_id: string };
        const entity = getEntity(store, entity_id);
        if (!entity) return { icon: "mdi:thermostat", label: "...", opacity: 0.4 };
        return resolveClimateState(entity);
      },
    },
    {
      id: "media_player_state",
      resolve(params): ButtonStateResult {
        const { entity_id } = params as { entity_id: string };
        const entity = getEntity(store, entity_id);
        if (!entity) return { icon: "mdi:play-circle", label: "...", opacity: 0.4 };
        return resolveMediaPlayerState(entity);
      },
    },
    {
      id: "sensor_value",
      resolve(params): ButtonStateResult {
        const { entity_id } = params as { entity_id: string };
        const entity = getEntity(store, entity_id);
        if (!entity) return { icon: "mdi:chart-line", label: "...", opacity: 0.4 };
        return resolveSensorValue(entity);
      },
    },
    {
      id: "cover_state",
      resolve(params): ButtonStateResult {
        const { entity_id } = params as { entity_id: string };
        const entity = getEntity(store, entity_id);
        if (!entity) return { icon: "mdi:blinds", label: "...", opacity: 0.4 };
        return resolveCoverState(entity);
      },
    },
    {
      id: "lock_state",
      resolve(params): ButtonStateResult {
        const { entity_id } = params as { entity_id: string };
        const entity = getEntity(store, entity_id);
        if (!entity) return { icon: "mdi:lock", label: "...", opacity: 0.4 };
        return resolveLockState(entity);
      },
    },
    {
      id: "fan_state",
      resolve(params): ButtonStateResult {
        const { entity_id } = params as { entity_id: string };
        const entity = getEntity(store, entity_id);
        if (!entity) return { icon: "mdi:fan", label: "...", opacity: 0.4 };
        return resolveFanState(entity);
      },
    },
  ];
}

import { z } from "zod";
import type { StateProviderDefinition, StateProviderResult, ButtonStateResult } from "../../types.js";
import { field, type TemplateVariable } from "@omnideck/plugin-schema";
import type { StateStore } from "../../../state/store.js";

const entityParamsSchema = z.object({
  entity_id: field(z.string(), { label: "Entity", fieldType: "ha_entity" }),
});

const lightParamsSchema = z.object({
  entity_id: field(z.string(), { label: "Entity", fieldType: "ha_entity", domain: "light" }),
});

const climateParamsSchema = z.object({
  entity_id: field(z.string(), { label: "Entity", fieldType: "ha_entity", domain: "climate" }),
});

const mediaPlayerParamsSchema = z.object({
  entity_id: field(z.string(), { label: "Entity", fieldType: "ha_entity", domain: "media_player" }),
});

const sensorParamsSchema = z.object({
  entity_id: field(z.string(), { label: "Entity", fieldType: "ha_entity", domain: "sensor" }),
});

const coverParamsSchema = z.object({
  entity_id: field(z.string(), { label: "Entity", fieldType: "ha_entity", domain: "cover" }),
});

const lockParamsSchema = z.object({
  entity_id: field(z.string(), { label: "Entity", fieldType: "ha_entity", domain: "lock" }),
});

const fanParamsSchema = z.object({
  entity_id: field(z.string(), { label: "Entity", fieldType: "ha_entity", domain: "fan" }),
});

interface EntityState {
  state: string;
  attributes: Record<string, unknown>;
}

// -- Domain defaults for icons, colors, labels --

const DOMAIN_ICONS: Record<string, string> = {
  light: "ms:lightbulb",
  switch: "ms:power",
  fan: "ms:mode-fan",
  lock: "ms:lock",
  cover: "ms:blinds",
  binary_sensor: "ms:visibility",
  sensor: "ms:show-chart",
  climate: "ms:thermostat",
  media_player: "ms:play-circle",
  scene: "ms:palette",
  script: "ms:description",
  automation: "ms:robot",
  vacuum: "ms:smart-toy",
  camera: "ms:camera",
  input_boolean: "ms:toggle-on",
  input_number: "ms:tune",
  input_select: "ms:arrow-drop-down-circle",
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

const DOMAIN_OFF_BG = "#000000";

function getDomain(entityId: string): string {
  return entityId.split(".")[0] ?? "unknown";
}

function getEntity(store: StateStore, entityId: string): EntityState | undefined {
  return store.get("home-assistant", `entity:${entityId}`) as EntityState | undefined;
}

function deviceName(entity: EntityState): string {
  return typeof entity.attributes.friendly_name === "string"
    ? entity.attributes.friendly_name
    : "";
}

// -- Generic entity state (works for any domain) --

function resolveGenericEntity(entity: EntityState, domain: string): StateProviderResult {
  const isOn = entity.state === "on";
  const state: ButtonStateResult = {
    icon: DOMAIN_ICONS[domain],
    label: entity.state,
    background: isOn ? (DOMAIN_ON_BG[domain] ?? "#065f46") : DOMAIN_OFF_BG,
  };

  if (!isOn && domain !== "sensor" && domain !== "climate" && domain !== "media_player") {
    state.iconColor = "#9ca3af";
  }

  // Friendly name override for label
  const name = deviceName(entity);
  if (name) {
    state.topLabel = name;
  }

  return {
    state,
    variables: {
      state: entity.state,
      domain,
      device_name: name,
    },
  };
}

// -- Specialized providers --

function resolveLightState(entity: EntityState): StateProviderResult {
  const isOn = entity.state === "on";
  const brightness = typeof entity.attributes.brightness === "number"
    ? Math.round((entity.attributes.brightness / 255) * 100)
    : undefined;

  const state: ButtonStateResult = {
    icon: "ms:lightbulb",
    background: DOMAIN_OFF_BG,
    iconColor: isOn ? "#facc15" : "#9ca3af",
  };

  if (isOn && brightness !== undefined) {
    state.label = `${brightness}%`;
    state.progress = brightness / 100;
  } else {
    state.label = isOn ? "On" : "Off";
  }

  let rgbHex = "";

  // Match icon color to the light's actual color if available
  if (isOn && entity.attributes.rgb_color) {
    const [r, g, b] = entity.attributes.rgb_color as [number, number, number];
    rgbHex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    state.iconColor = rgbHex;
  }

  return {
    state,
    variables: {
      state: entity.state,
      brightness_percent: brightness !== undefined ? String(brightness) : "",
      device_name: deviceName(entity),
      rgb_hex: rgbHex,
    },
  };
}

function resolveClimateState(entity: EntityState): StateProviderResult {
  const hvacMode = entity.state; // "heat", "cool", "heat_cool", "off", "auto", "dry", "fan_only"
  const currentTemp = entity.attributes.current_temperature as number | undefined;
  const targetTemp = entity.attributes.temperature as number | undefined;
  const unit = (entity.attributes.unit_of_measurement as string) ?? "°";

  let background = DOMAIN_OFF_BG;
  let icon = "ms:thermostat";
  if (hvacMode === "heat" || hvacMode === "heat_cool") {
    background = "#92400e";
    icon = "ms:local-fire-department";
  } else if (hvacMode === "cool") {
    background = "#1e3a5f";
    icon = "ms:ac-unit";
  } else if (hvacMode === "auto") {
    background = "#065f46";
  }

  const hvacAction = entity.attributes.hvac_action as string | undefined;
  if (hvacAction === "heating") background = "#b45309";
  else if (hvacAction === "cooling") background = "#0369a1";
  else if (hvacAction === "idle") background = "#000000";

  return {
    state: {
      icon,
      background,
      label: currentTemp !== undefined ? `${currentTemp}${unit}` : hvacMode,
      topLabel: targetTemp !== undefined ? `→ ${targetTemp}${unit}` : undefined,
    },
    variables: {
      state: entity.state,
      current_temp: currentTemp !== undefined ? String(currentTemp) : "",
      target_temp: targetTemp !== undefined ? String(targetTemp) : "",
      hvac_mode: hvacMode,
      device_name: deviceName(entity),
    },
  };
}

function resolveMediaPlayerState(entity: EntityState): StateProviderResult {
  const isPlaying = entity.state === "playing";
  const isPaused = entity.state === "paused";
  const title = (entity.attributes.media_title as string | undefined) ?? "";
  const artist = (entity.attributes.media_artist as string | undefined) ?? "";
  const appName = (entity.attributes.app_name as string | undefined) ?? "";

  let icon = "ms:play-circle";
  if (isPlaying) icon = "ms:pause-circle";
  else if (isPaused) icon = "ms:play-circle";
  else icon = "ms:stop-circle";

  return {
    state: {
      icon,
      background: isPlaying ? "#065f46" : DOMAIN_OFF_BG,
      label: title || entity.state,
      topLabel: appName || undefined,
      iconColor: entity.state === "off" || entity.state === "unavailable" ? "#9ca3af" : "#ffffff",
    },
    variables: {
      state: entity.state,
      title,
      artist,
      app_name: appName,
      device_name: deviceName(entity),
    },
  };
}

function resolveSensorValue(entity: EntityState): StateProviderResult {
  const value = entity.state;
  const unit = (entity.attributes.unit_of_measurement as string | undefined) ?? "";
  const deviceClass = (entity.attributes.device_class as string | undefined) ?? "";

  let icon = DOMAIN_ICONS.sensor;
  if (deviceClass === "temperature") icon = "ms:thermostat";
  else if (deviceClass === "humidity") icon = "ms:humidity-high";
  else if (deviceClass === "battery") icon = "ms:battery-full";
  else if (deviceClass === "power" || deviceClass === "energy") icon = "ms:bolt";
  else if (deviceClass === "pressure") icon = "ms:speed";
  else if (deviceClass === "illuminance") icon = "ms:brightness-4";
  else if (deviceClass === "motion" || deviceClass === "occupancy") icon = "ms:motion-sensor-active";

  const state: ButtonStateResult = {
    icon,
    label: unit ? `${value} ${unit}` : value,
  };

  // Battery: show progress bar and color-code
  if (deviceClass === "battery") {
    const pct = parseFloat(value);
    if (!isNaN(pct)) {
      state.progress = pct / 100;
      if (pct <= 20) state.badgeColor = "#ef4444";
      else if (pct <= 50) state.badgeColor = "#f59e0b";
    }
  }

  return {
    state,
    variables: {
      state: entity.state,
      value,
      unit,
      device_class: deviceClass,
      device_name: deviceName(entity),
    },
  };
}

function resolveCoverState(entity: EntityState): StateProviderResult {
  const position = entity.attributes.current_position as number | undefined;
  const isOpen = entity.state === "open";
  const isClosed = entity.state === "closed";

  let icon = "ms:blinds";
  if (entity.attributes.device_class === "garage") {
    icon = isOpen ? "ms:garage-door" : "ms:garage";
  } else if (isClosed) {
    icon = "ms:blinds-closed";
  }

  return {
    state: {
      icon,
      background: isOpen ? "#1e3a5f" : DOMAIN_OFF_BG,
      label: position !== undefined ? `${position}%` : entity.state,
      progress: position !== undefined ? position / 100 : undefined,
      iconColor: isClosed ? "#9ca3af" : "#ffffff",
    },
    variables: {
      state: entity.state,
      position: position !== undefined ? String(position) : "",
      device_name: deviceName(entity),
    },
  };
}

function resolveLockState(entity: EntityState): StateProviderResult {
  const isLocked = entity.state === "locked";
  return {
    state: {
      icon: isLocked ? "ms:lock" : "ms:lock-open",
      background: isLocked ? "#991b1b" : "#065f46",
      label: isLocked ? "Locked" : "Unlocked",
    },
    variables: {
      state: entity.state,
      device_name: deviceName(entity),
    },
  };
}

function resolveFanState(entity: EntityState): StateProviderResult {
  const isOn = entity.state === "on";
  const pct = entity.attributes.percentage as number | undefined;

  return {
    state: {
      icon: "ms:mode-fan",
      background: isOn ? "#1e3a5f" : DOMAIN_OFF_BG,
      label: isOn && pct !== undefined ? `${pct}%` : isOn ? "On" : "Off",
      progress: isOn && pct !== undefined ? pct / 100 : undefined,
      iconColor: isOn ? "#ffffff" : "#9ca3af",
    },
    variables: {
      state: entity.state,
      speed_percent: pct !== undefined ? String(pct) : "",
      device_name: deviceName(entity),
    },
  };
}

// -- Template variable declarations --

const TV_STATE: TemplateVariable = { key: "state", label: "State", example: "on" };
const TV_DOMAIN: TemplateVariable = { key: "domain", label: "Domain", example: "light" };
const TV_DEVICE_NAME: TemplateVariable = { key: "device_name", label: "Device Name", example: "Living Room" };
const TV_BRIGHTNESS: TemplateVariable = { key: "brightness_percent", label: "Brightness %", example: "75" };
const TV_RGB_HEX: TemplateVariable = { key: "rgb_hex", label: "RGB Hex", example: "#ff8800" };
const TV_CURRENT_TEMP: TemplateVariable = { key: "current_temp", label: "Current Temp", example: "72" };
const TV_TARGET_TEMP: TemplateVariable = { key: "target_temp", label: "Target Temp", example: "70" };
const TV_HVAC_MODE: TemplateVariable = { key: "hvac_mode", label: "HVAC Mode", example: "heat" };
const TV_TITLE: TemplateVariable = { key: "title", label: "Title", example: "Bohemian Rhapsody" };
const TV_ARTIST: TemplateVariable = { key: "artist", label: "Artist", example: "Queen" };
const TV_APP_NAME: TemplateVariable = { key: "app_name", label: "App Name", example: "Spotify" };
const TV_VALUE: TemplateVariable = { key: "value", label: "Value", example: "72.5" };
const TV_UNIT: TemplateVariable = { key: "unit", label: "Unit", example: "°F" };
const TV_DEVICE_CLASS: TemplateVariable = { key: "device_class", label: "Device Class", example: "temperature" };
const TV_POSITION: TemplateVariable = { key: "position", label: "Position %", example: "50" };
const TV_SPEED: TemplateVariable = { key: "speed_percent", label: "Speed %", example: "60" };

// -- Provider factories --

const EMPTY_VARS: Record<string, string> = {};

export function createHaStateProviders(store: StateStore): StateProviderDefinition[] {
  return [
    {
      id: "entity_state",
      name: "Entity State",
      description: "Generic state for any Home Assistant entity",
      icon: "ms:home",
      paramsSchema: entityParamsSchema,
      templateVariables: [TV_STATE, TV_DOMAIN, TV_DEVICE_NAME],
      resolve(params): StateProviderResult {
        const { entity_id } = params as { entity_id: string };
        if (!entity_id) return { state: { label: "?" }, variables: EMPTY_VARS };

        const entity = getEntity(store, entity_id);
        const domain = getDomain(entity_id);
        if (!entity) return { state: { icon: DOMAIN_ICONS[domain], label: "...", opacity: 0.4 }, variables: EMPTY_VARS };

        return resolveGenericEntity(entity, domain);
      },
    },
    {
      id: "light_state",
      name: "Light State",
      description: "State for light entities with brightness and color",
      icon: "ms:lightbulb",
      paramsSchema: lightParamsSchema,
      providesIcon: true,
      templateVariables: [TV_STATE, TV_BRIGHTNESS, TV_DEVICE_NAME, TV_RGB_HEX],
      resolve(params): StateProviderResult {
        const { entity_id } = params as { entity_id: string };
        const entity = getEntity(store, entity_id);
        if (!entity) return { state: { icon: "ms:lightbulb", label: "...", opacity: 0.4 }, variables: EMPTY_VARS };
        return resolveLightState(entity);
      },
    },
    {
      id: "climate_state",
      name: "Climate State",
      description: "State for climate/thermostat entities",
      icon: "ms:thermostat",
      paramsSchema: climateParamsSchema,
      providesIcon: true,
      templateVariables: [TV_STATE, TV_CURRENT_TEMP, TV_TARGET_TEMP, TV_HVAC_MODE, TV_DEVICE_NAME],
      resolve(params): StateProviderResult {
        const { entity_id } = params as { entity_id: string };
        const entity = getEntity(store, entity_id);
        if (!entity) return { state: { icon: "ms:thermostat", label: "...", opacity: 0.4 }, variables: EMPTY_VARS };
        return resolveClimateState(entity);
      },
    },
    {
      id: "media_player_state",
      name: "Media Player State",
      description: "State for media player entities with now-playing info",
      icon: "ms:play-circle",
      paramsSchema: mediaPlayerParamsSchema,
      providesIcon: true,
      templateVariables: [TV_STATE, TV_TITLE, TV_ARTIST, TV_APP_NAME, TV_DEVICE_NAME],
      resolve(params): StateProviderResult {
        const { entity_id } = params as { entity_id: string };
        const entity = getEntity(store, entity_id);
        if (!entity) return { state: { icon: "ms:play-circle", label: "...", opacity: 0.4 }, variables: EMPTY_VARS };
        return resolveMediaPlayerState(entity);
      },
    },
    {
      id: "sensor_value",
      name: "Sensor Value",
      description: "State for sensor entities with value and unit",
      icon: "ms:show-chart",
      paramsSchema: sensorParamsSchema,
      templateVariables: [TV_STATE, TV_VALUE, TV_UNIT, TV_DEVICE_CLASS, TV_DEVICE_NAME],
      resolve(params): StateProviderResult {
        const { entity_id } = params as { entity_id: string };
        const entity = getEntity(store, entity_id);
        if (!entity) return { state: { icon: "ms:show-chart", label: "...", opacity: 0.4 }, variables: EMPTY_VARS };
        return resolveSensorValue(entity);
      },
    },
    {
      id: "cover_state",
      name: "Cover State",
      description: "State for cover entities (blinds, garage doors)",
      icon: "ms:blinds",
      paramsSchema: coverParamsSchema,
      providesIcon: true,
      templateVariables: [TV_STATE, TV_POSITION, TV_DEVICE_NAME],
      resolve(params): StateProviderResult {
        const { entity_id } = params as { entity_id: string };
        const entity = getEntity(store, entity_id);
        if (!entity) return { state: { icon: "ms:blinds", label: "...", opacity: 0.4 }, variables: EMPTY_VARS };
        return resolveCoverState(entity);
      },
    },
    {
      id: "lock_state",
      name: "Lock State",
      description: "State for lock entities",
      icon: "ms:lock",
      paramsSchema: lockParamsSchema,
      providesIcon: true,
      templateVariables: [TV_STATE, TV_DEVICE_NAME],
      resolve(params): StateProviderResult {
        const { entity_id } = params as { entity_id: string };
        const entity = getEntity(store, entity_id);
        if (!entity) return { state: { icon: "ms:lock", label: "...", opacity: 0.4 }, variables: EMPTY_VARS };
        return resolveLockState(entity);
      },
    },
    {
      id: "fan_state",
      name: "Fan State",
      description: "State for fan entities with speed",
      icon: "ms:mode-fan",
      paramsSchema: fanParamsSchema,
      providesIcon: true,
      templateVariables: [TV_STATE, TV_SPEED, TV_DEVICE_NAME],
      resolve(params): StateProviderResult {
        const { entity_id } = params as { entity_id: string };
        const entity = getEntity(store, entity_id);
        if (!entity) return { state: { icon: "ms:mode-fan", label: "...", opacity: 0.4 }, variables: EMPTY_VARS };
        return resolveFanState(entity);
      },
    },
  ];
}

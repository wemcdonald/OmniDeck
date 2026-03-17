import type { StateProviderDefinition, ButtonStateResult } from "../../types.js";
import type { StateStore } from "../../../state/store.js";

interface EntityState {
  state: string;
  attributes: Record<string, unknown>;
}

function renderEntityState(entity: EntityState, domain: string): ButtonStateResult {
  const result: ButtonStateResult = {};
  const isOn = entity.state === "on";

  switch (domain) {
    case "light":
      result.background = isOn ? "#f59e0b" : "#374151";
      result.label = isOn ? "on" : "off";
      result.icon = "lightbulb";
      if (isOn && typeof entity.attributes.brightness === "number") {
        result.progress = Math.round((entity.attributes.brightness / 255) * 100);
      }
      break;
    case "switch":
      result.background = isOn ? "#10b981" : "#374151";
      result.label = isOn ? "on" : "off";
      result.icon = "power";
      break;
    case "binary_sensor":
      result.background = isOn ? "#ef4444" : "#374151";
      result.label = isOn ? "On" : "Off";
      break;
    case "sensor":
      result.label = String(entity.state);
      if (typeof entity.attributes.unit_of_measurement === "string") {
        result.topLabel = entity.attributes.unit_of_measurement;
      }
      break;
    case "scene":
      result.background = "#8b5cf6";
      result.label = "Scene";
      break;
    default:
      result.label = entity.state;
  }

  return result;
}

export function createEntityStateProvider(store: StateStore): StateProviderDefinition {
  return {
    id: "entity_state",
    resolve(params): ButtonStateResult {
      const { entity_id } = params as { entity_id: string };
      if (!entity_id) return { label: "?" };

      const entity = store.get("home-assistant", `entity:${entity_id}`) as EntityState | undefined;
      if (!entity) return { label: "unavailable", opacity: 0.5 };

      const domain = entity_id.split(".")[0] ?? "unknown";
      return renderEntityState(entity, domain);
    },
  };
}

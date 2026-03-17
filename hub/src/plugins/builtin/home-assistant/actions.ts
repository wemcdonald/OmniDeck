import type { ActionDefinition } from "../../types.js";

type ServiceCaller = (
  domain: string,
  service: string,
  data: Record<string, unknown>,
) => Promise<void>;

export function createHaActions(callService: ServiceCaller): ActionDefinition[] {
  return [
    {
      id: "toggle",
      name: "Toggle",
      async execute(params) {
        const { entity_id } = params as { entity_id: string };
        const domain = entity_id.split(".")[0] ?? "homeassistant";
        await callService(domain, "toggle", { entity_id });
      },
    },
    {
      id: "turn_on",
      name: "Turn On",
      async execute(params) {
        const { entity_id, ...rest } = params as { entity_id: string; [k: string]: unknown };
        const domain = entity_id.split(".")[0] ?? "homeassistant";
        await callService(domain, "turn_on", { entity_id, ...rest });
      },
    },
    {
      id: "turn_off",
      name: "Turn Off",
      async execute(params) {
        const { entity_id } = params as { entity_id: string };
        const domain = entity_id.split(".")[0] ?? "homeassistant";
        await callService(domain, "turn_off", { entity_id });
      },
    },
    {
      id: "call_service",
      name: "Call Service",
      async execute(params) {
        const { domain, service, data } = params as {
          domain: string;
          service: string;
          data: Record<string, unknown>;
        };
        await callService(domain, service, data ?? {});
      },
    },
  ];
}

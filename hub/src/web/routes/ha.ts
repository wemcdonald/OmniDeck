import { Hono } from "hono";
import type { StateStore } from "../../state/store.js";

interface EntityRegistryEntry {
  entity_id: string;
  name?: string;
  platform?: string;
  device_id?: string;
  area_id?: string;
  original_name?: string;
  disabled_by?: string;
  hidden_by?: string;
}

interface CachedEntityState {
  state: string;
  attributes: Record<string, unknown>;
}

/**
 * API routes for the HA entity browser.
 *
 * These let the web config UI browse HA entities, filter by domain,
 * and preview current state — powering the entity picker dropdown.
 */
export function createHaRoutes(store: StateStore): Hono {
  const router = new Hono();

  // -- List all entities (optionally filtered by domain) --
  router.get("/entities", (c) => {
    const domain = c.req.query("domain"); // e.g. "light", "switch"
    const search = c.req.query("q")?.toLowerCase(); // free-text search

    const registry = (store.get("home-assistant", "entity_registry") ?? []) as EntityRegistryEntry[];

    let entities = registry.filter((e) => !e.disabled_by && !e.hidden_by);

    if (domain) {
      entities = entities.filter((e) => e.entity_id.startsWith(`${domain}.`));
    }

    if (search) {
      entities = entities.filter(
        (e) =>
          e.entity_id.toLowerCase().includes(search) ||
          (e.name ?? "").toLowerCase().includes(search) ||
          (e.original_name ?? "").toLowerCase().includes(search),
      );
    }

    // Enrich with current state if available
    const result = entities.map((e) => {
      const state = store.get("home-assistant", `entity:${e.entity_id}`) as CachedEntityState | undefined;
      return {
        entity_id: e.entity_id,
        name: e.name ?? e.original_name ?? e.entity_id,
        domain: e.entity_id.split(".")[0],
        platform: e.platform,
        area_id: e.area_id,
        state: state?.state ?? "unknown",
        attributes: state?.attributes ?? {},
      };
    });

    return c.json(result);
  });

  // -- List available domains --
  router.get("/domains", (c) => {
    const registry = (store.get("home-assistant", "entity_registry") ?? []) as EntityRegistryEntry[];
    const domains = new Set<string>();
    for (const e of registry) {
      if (!e.disabled_by && !e.hidden_by) {
        domains.add(e.entity_id.split(".")[0]);
      }
    }
    return c.json(Array.from(domains).sort());
  });

  // -- Get a single entity's current state --
  router.get("/entities/:entity_id{.+}", (c) => {
    const entityId = c.req.param("entity_id");
    const state = store.get("home-assistant", `entity:${entityId}`) as CachedEntityState | undefined;
    if (!state) return c.json({ error: "Entity not found or not yet loaded" }, 404);
    return c.json({ entity_id: entityId, ...state });
  });

  // -- HA connection status --
  router.get("/status", (c) => {
    const connected = (store.get("home-assistant", "connected") as boolean) ?? false;
    const haVersion = (store.get("home-assistant", "ha_version") as string) ?? "";
    const registryCount = ((store.get("home-assistant", "entity_registry") ?? []) as unknown[]).length;

    // Count entities in store
    const allHaState = store.getAll("home-assistant");
    let entityCount = 0;
    for (const key of allHaState.keys()) {
      if (key.startsWith("entity:")) entityCount++;
    }

    return c.json({
      connected,
      ha_version: haVersion,
      entity_count: entityCount,
      registry_count: registryCount,
    });
  });

  return router;
}

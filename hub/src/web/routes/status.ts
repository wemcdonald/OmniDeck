import { Hono } from "hono";

interface StatusRouteDeps {
  getAgents(): unknown[];
  getPluginStatuses(): unknown[];
  getPluginCatalog?(): unknown;
  getDeckPreview(): Promise<Record<number, string>>;
  pressKey(key: number): Promise<void>;
  getActiveMode?(): { id: string | null; name: string | null; icon: string | null };
}

export function createStatusRoutes(deps: StatusRouteDeps): Hono {
  const router = new Hono();

  router.get("/status/agents", (c) => c.json(deps.getAgents()));
  router.get("/status/plugins", (c) => c.json(deps.getPluginStatuses()));
  if (deps.getPluginCatalog) {
    const getCatalog = deps.getPluginCatalog;
    router.get("/status/plugin-catalog", (c) => c.json(getCatalog()));
  }
  router.get("/deck/preview", async (c) => c.json(await deps.getDeckPreview()));

  if (deps.getActiveMode) {
    const getActiveMode = deps.getActiveMode;
    router.get("/status/active-mode", (c) => c.json(getActiveMode()));
  }

  router.post("/deck/press/:key", async (c) => {
    const key = parseInt(c.req.param("key"), 10);
    if (isNaN(key)) return c.json({ error: "Invalid key" }, 400);
    await deps.pressKey(key);
    return c.json({ ok: true });
  });

  return router;
}

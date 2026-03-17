import { Hono } from "hono";

interface StatusRouteDeps {
  getAgents(): unknown[];
  getPluginStatuses(): unknown[];
  getDeckPreview(): Record<number, string>;
  pressKey(key: number): Promise<void>;
}

export function createStatusRoutes(deps: StatusRouteDeps): Hono {
  const router = new Hono();

  router.get("/status/agents", (c) => c.json(deps.getAgents()));
  router.get("/status/plugins", (c) => c.json(deps.getPluginStatuses()));
  router.get("/deck/preview", (c) => c.json(deps.getDeckPreview()));

  router.post("/deck/press/:key", async (c) => {
    const key = parseInt(c.req.param("key"), 10);
    if (isNaN(key)) return c.json({ error: "Invalid key" }, 400);
    await deps.pressKey(key);
    return c.json({ ok: true });
  });

  return router;
}

import { Hono } from "hono";
import type { PairingManager } from "../../server/pairing.js";

export function createPairingRoutes(pairing: PairingManager): Hono {
  const app = new Hono();

  app.post("/code", (c) => {
    const { code, expiresAt } = pairing.generateCode();
    return c.json({ code, expires_at: expiresAt.toISOString() });
  });

  app.get("/agents", (c) => {
    return c.json(pairing.listAgents());
  });

  app.delete("/agents/:id", (c) => {
    const agentId = c.req.param("id");
    const revoked = pairing.revokeAgent(agentId);
    if (!revoked) {
      return c.json({ error: "Agent not found" }, 404);
    }
    return c.json({ ok: true });
  });

  return app;
}

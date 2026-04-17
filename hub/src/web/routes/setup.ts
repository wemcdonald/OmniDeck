import { Hono } from "hono";
import {
  getState,
  scanWifi,
  connectWifi,
  isApActive,
  SETUP_AP_SSID,
} from "../../services/network.js";
import { createLogger } from "../../logger.js";

const log = createLogger("setup");

export function createSetupRoutes(): Hono {
  const router = new Hono();

  router.get("/state", async (c) => {
    const state = await getState();
    return c.json({ ...state, setup_ssid: SETUP_AP_SSID });
  });

  router.get("/scan", async (c) => {
    const networks = await scanWifi();
    return c.json({ networks });
  });

  router.post("/connect", async (c) => {
    let body: { ssid?: unknown; password?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const ssid = typeof body.ssid === "string" ? body.ssid.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!ssid) return c.json({ ok: false, error: "SSID required" }, 400);
    if (ssid.length > 32) return c.json({ ok: false, error: "SSID too long" }, 400);

    const onAp = await isApActive();
    const result = await connectWifi(ssid, password);

    log.info({ ssid, ok: result.ok, onAp }, "connect attempt");

    if (!result.ok) {
      return c.json({ ok: false, error: result.error ?? "Connect failed" }, 400);
    }
    return c.json({ ok: true });
  });

  return router;
}

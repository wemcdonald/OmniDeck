import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createStatusRoutes } from "../../routes/status.js";

describe("Status routes", () => {
  function makeApp(overrides: Partial<Parameters<typeof createStatusRoutes>[0]> = {}) {
    const app = new Hono();
    app.route("/api", createStatusRoutes({
      getAgents: overrides.getAgents ?? (() => []),
      getPluginStatuses: overrides.getPluginStatuses ?? (() => []),
      getDeckPreview: overrides.getDeckPreview ?? (() => Promise.resolve({})),
      pressKey: overrides.pressKey ?? (async () => {}),
    }));
    return app;
  }

  it("GET /api/status/agents returns agent list", async () => {
    const app = makeApp({
      getAgents: () => [{ id: "agent-1", name: "Test Agent" }],
    });
    const res = await app.request("/api/status/agents");
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(body).toHaveLength(1);
  });

  it("GET /api/status/plugins returns plugin statuses", async () => {
    const app = makeApp({
      getPluginStatuses: () => [{ id: "plugin-1", status: "running" }],
    });
    const res = await app.request("/api/status/plugins");
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(body).toHaveLength(1);
  });

  it("GET /api/deck/preview returns preview map", async () => {
    const app = makeApp({
      getDeckPreview: () => Promise.resolve({ 0: "abc", 1: "def" }),
    });
    const res = await app.request("/api/deck/preview");
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, string>;
    expect(body[0]).toBe("data:image/png;base64,abc");
  });

  it("POST /api/deck/press/:key calls pressKey and returns {ok:true}", async () => {
    let pressed = -1;
    const app = makeApp({
      pressKey: async (key) => { pressed = key; },
    });
    const res = await app.request("/api/deck/press/3", { method: "POST" });
    expect(res.status).toBe(200);
    expect(pressed).toBe(3);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("POST /api/deck/press/:key returns 400 for non-numeric key", async () => {
    const app = makeApp();
    const res = await app.request("/api/deck/press/abc", { method: "POST" });
    expect(res.status).toBe(400);
  });
});

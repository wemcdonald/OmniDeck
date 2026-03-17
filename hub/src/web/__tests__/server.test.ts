import { describe, it, expect, afterEach } from "vitest";
import { WebServer } from "../server.js";

describe("WebServer", () => {
  let server: WebServer;

  afterEach(async () => {
    if (server) await server.stop();
  });

  it("starts on a given port and responds to health check", async () => {
    server = new WebServer({ port: 0 });
    const port = await server.start();
    expect(port).toBeGreaterThan(0);
    const res = await fetch(`http://localhost:${port}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("returns 404 for unknown API routes", async () => {
    server = new WebServer({ port: 0 });
    const port = await server.start();
    const res = await fetch(`http://localhost:${port}/api/nonexistent`);
    expect(res.status).toBe(404);
  });
});

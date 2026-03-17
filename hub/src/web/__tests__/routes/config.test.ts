import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { createConfigRoutes } from "../../routes/config.js";

describe("Config routes", () => {
  let tmpDir: string;
  let app: Hono;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "omnideck-config-routes-"));
    mkdirSync(join(tmpDir, "pages"));
    writeFileSync(
      join(tmpDir, "main.yaml"),
      `deck:\n  brightness: 80\n  default_page: home\nplugins:\n  home-assistant:\n    url: "ws://ha.local:8123"\n`
    );
    writeFileSync(
      join(tmpDir, "pages", "home.yaml"),
      `page: home\nname: "Home"\nbuttons:\n  - pos: [0, 0]\n    label: "Test"\n`
    );
    app = new Hono();
    app.route("/api/config", createConfigRoutes(tmpDir));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it("GET /api/config/pages returns page list", async () => {
    const res = await app.request("/api/config/pages");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any[];
    expect(body).toHaveLength(1);
    expect(body[0].page).toBe("home");
  });

  it("GET /api/config/pages/:id returns a single page", async () => {
    const res = await app.request("/api/config/pages/home");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.name).toBe("Home");
    expect(body.buttons).toHaveLength(1);
  });

  it("PUT /api/config/pages/:id saves page YAML", async () => {
    const res = await app.request("/api/config/pages/home", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: "home",
        name: "Home Updated",
        buttons: [],
      }),
    });
    expect(res.status).toBe(200);
    const raw = readFileSync(join(tmpDir, "pages", "home.yaml"), "utf-8");
    expect(raw).toContain("Home Updated");
  });

  it("GET /api/config/plugins returns plugin configs", async () => {
    const res = await app.request("/api/config/plugins");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body["home-assistant"]).toBeDefined();
  });

  it("GET /api/config/raw/main.yaml returns raw YAML string", async () => {
    const res = await app.request("/api/config/raw/main.yaml");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.content).toContain("brightness: 80");
  });

  it("PUT /api/config/raw/main.yaml writes file", async () => {
    const newContent = `deck:\n  brightness: 50\nplugins: {}\n`;
    const res = await app.request("/api/config/raw/main.yaml", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent }),
    });
    expect(res.status).toBe(200);
    const written = readFileSync(join(tmpDir, "main.yaml"), "utf-8");
    expect(written).toBe(newContent);
  });

  it("rejects path traversal in raw filename", async () => {
    // Use URL-encoded traversal (%2e%2e%2f) — literal "../" is normalized away by
    // the URL parser before the route handler runs, so it would never reach the
    // security check. Encoded traversal (%2e%2e = "..", %2f = "/") does reach the
    // handler and tests the basename() guard correctly.
    const res = await app.request("/api/config/raw/%2e%2e%2fetc%2fpasswd");
    expect(res.status).toBe(400);
  });
});

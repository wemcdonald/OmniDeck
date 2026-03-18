import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer, type WebSocket } from "ws";
import { createLogger } from "../logger.js";
import { createConfigRoutes } from "./routes/config.js";
import { createStatusRoutes } from "./routes/status.js";
import type { Broadcaster } from "./broadcast.js";
import type { AgentServer } from "../server/server.js";
import type { PluginHost } from "../plugins/host.js";
import type { DeckManager } from "../deck/types.js";

const log = createLogger("web");

export interface WebServerOptions {
  port: number;
  configDir?: string;
  agentServer?: AgentServer;
  pluginHost?: PluginHost;
  deck?: DeckManager;
  broadcaster?: Broadcaster;
  staticDir?: string;
  getPagePreview?: (pageId: string) => Promise<Record<string, string>>;
}

export class WebServer {
  private app: Hono;
  private server: ServerType | null = null;
  private wss: WebSocketServer | null = null;
  private opts: WebServerOptions;

  constructor(opts: WebServerOptions) {
    this.opts = opts;
    this.app = new Hono();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    const { configDir, agentServer, deck, broadcaster, getPagePreview } = this.opts;

    this.app.get("/api/health", (c) => c.json({ status: "ok" }));

    if (getPagePreview) {
      this.app.get("/api/deck/preview/:pageId", async (c) => {
        const pageId = c.req.param("pageId");
        try {
          const previews = await getPagePreview(pageId);
          return c.json(previews);
        } catch (err) {
          log.error({ err, pageId }, "Preview render failed");
          return c.json({ error: "Render failed" }, 500);
        }
      });
    }

    if (configDir) {
      this.app.route("/api/config", createConfigRoutes(configDir));
    }

    if (agentServer || deck) {
      this.app.route(
        "/api",
        createStatusRoutes({
          getAgents: () => agentServer?.getConnectedAgents() ?? [],
          getPluginStatuses: () => [],
          getDeckPreview: () => ({}),
          pressKey: async (key) => {
            log.info({ key }, "Browser simulated key press");
          },
        }),
      );
    }

    // Serve static SPA files (production) using a custom fs-based middleware
    // that accepts an absolute staticDir path
    if (this.opts.staticDir) {
      const staticDir = this.opts.staticDir;
      const mimeTypes: Record<string, string> = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".ttf": "font/ttf",
      };
      this.app.use("/*", async (c, next) => {
        // Do not intercept API routes
        if (c.req.path.startsWith("/api/") || c.req.path === "/ws") {
          return next();
        }
        const filePath = join(staticDir, c.req.path);
        if (existsSync(filePath)) {
          const ext = extname(filePath);
          const mime = mimeTypes[ext] ?? "application/octet-stream";
          const body = await readFile(filePath);
          return c.body(body as unknown as string, 200, { "Content-Type": mime });
        }
        // SPA fallback — serve index.html
        const indexPath = join(staticDir, "index.html");
        if (existsSync(indexPath)) {
          const body = await readFile(indexPath, "utf-8");
          return c.html(body);
        }
        return next();
      });
    }

    // 404 for unknown /api/* routes
    this.app.notFound((c) => {
      if (c.req.path.startsWith("/api/")) {
        return c.json({ error: "Not found" }, 404);
      }
      return c.json({ error: "Not found" }, 404);
    });

    // Wire up WebSocket server if broadcaster provided
    if (broadcaster) {
      this.wss = new WebSocketServer({ noServer: true });
      this.wss.on("connection", (ws: WebSocket) => {
        broadcaster.add(ws as unknown as Parameters<Broadcaster["add"]>[0]);
        log.info("Browser WebSocket connected");

        ws.on("message", (raw) => {
          try {
            const msg = JSON.parse(String(raw)) as { type: string; data?: unknown };
            if (msg.type === "deck:press") {
              const data = msg.data as { key: number };
              log.info({ key: data.key }, "Browser simulated key press");
            }
          } catch {
            // ignore malformed messages
          }
        });

        ws.on("close", () => {
          broadcaster.remove(ws as unknown as Parameters<Broadcaster["remove"]>[0]);
          log.info("Browser WebSocket disconnected");
        });
      });
    }
  }

  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server = serve(
        { fetch: this.app.fetch, port: this.opts.port, hostname: "0.0.0.0" },
        (info) => {
          // Attach WebSocket upgrade handler to the raw Node HTTP server
          if (this.wss) {
            const rawServer = this.server as unknown as {
              on(event: string, listener: (...args: unknown[]) => void): void;
            };
            rawServer.on("upgrade", (req: unknown, socket: unknown, head: unknown) => {
              const reqHttp = req as { url?: string };
              if (reqHttp.url === "/ws") {
                this.wss!.handleUpgrade(
                  req as Parameters<WebSocketServer["handleUpgrade"]>[0],
                  socket as Parameters<WebSocketServer["handleUpgrade"]>[1],
                  head as Parameters<WebSocketServer["handleUpgrade"]>[2],
                  (ws) => {
                    this.wss!.emit("connection", ws, req);
                  },
                );
              } else {
                (socket as { destroy(): void }).destroy();
              }
            });
          }
          log.info({ port: info.port }, "Web server started");
          resolve(info.port);
        },
      );
    });
  }

  async stop(): Promise<void> {
    if (this.wss) {
      await new Promise<void>((resolve) => this.wss!.close(() => resolve()));
      this.wss = null;
    }
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }

  get hono(): Hono {
    return this.app;
  }
}

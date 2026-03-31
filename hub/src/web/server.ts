import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { join, extname } from "node:path";
import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer, type WebSocket } from "ws";
import { createLogger, replayLogs } from "../logger.js";
import { createConfigRoutes } from "./routes/config.js";
import { createStatusRoutes } from "./routes/status.js";
import { createHaRoutes } from "./routes/ha.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createPairingRoutes } from "./routes/pairing.js";
import { createPluginInstallRoutes } from "./routes/plugins.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import type { Broadcaster } from "./broadcast.js";
import type { AgentServer } from "../server/server.js";
import type { PairingManager } from "../server/pairing.js";
import type { PluginHost } from "../plugins/host.js";
import type { PluginRegistry } from "../plugins/registry.js";
import type { DeckManager } from "../deck/types.js";
import type { StateStore } from "../state/store.js";

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
  getDeckPreview?: () => Promise<Record<number, string>>;
  pressKey?: (key: number) => Promise<void>;
  getPluginStatuses?: () => Array<{ id: string; name: string; version: string; status: string }>;
  getPresets?: () => Array<{ qualifiedId: string; pluginId: string; name: string; defaults: Record<string, unknown> }>;
  store?: StateStore;
  debugModes?: () => unknown[];
  getModeHistory?: () => unknown[];
  getModeOverride?: () => string | null;
  // Security options
  pairing?: PairingManager;
  tls?: { cert: Buffer; key: Buffer };
  httpsPort?: number;
  authPasswordHash?: string;
  pluginsDir?: string;
  pluginRegistry?: PluginRegistry;
  onPluginInstalled?: (pluginId: string) => Promise<void>;
  tlsRedirect?: boolean;
  caCertPath?: string;
  caCert?: Buffer;
}

export class WebServer {
  private app: Hono;
  private server: ServerType | null = null;
  private httpsServer: ReturnType<typeof createHttpsServer> | null = null;
  private httpsServerType: ServerType | null = null;
  private wss: WebSocketServer | null = null;
  private wssHttps: WebSocketServer | null = null;
  private opts: WebServerOptions;

  constructor(opts: WebServerOptions) {
    this.opts = opts;
    this.app = new Hono();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    const { configDir, agentServer, deck, broadcaster, getPagePreview, getDeckPreview, pressKey, getPluginStatuses, getPresets, store } = this.opts;

    // TLS redirect middleware (only when explicitly enabled)
    if (this.opts.tlsRedirect && this.opts.tls) {
      this.app.use("/*", async (c, next) => {
        // Always allow CA cert download over HTTP
        if (c.req.path === "/api/tls/ca.crt") return next();

        const proto = c.req.header("x-forwarded-proto") ?? "http";
        if (proto !== "https" && !c.req.url.startsWith("https://")) {
          const host = c.req.header("host")?.split(":")[0] ?? "localhost";
          const httpsPort = this.opts.httpsPort ?? 9443;
          const url = `https://${host}:${httpsPort}${c.req.path}`;
          return c.redirect(url, 301);
        }
        return next();
      });
    }

    // Auth middleware (only when password is configured)
    if (this.opts.authPasswordHash) {
      this.app.use(
        "/*",
        createAuthMiddleware({
          passwordHash: this.opts.authPasswordHash,
          isHttps: !!this.opts.tls,
        }),
      );
    }

    // Auth routes (always mounted — /api/auth/status tells the client whether auth is required)
    this.app.route(
      "/api",
      createAuthRoutes({
        passwordHash: this.opts.authPasswordHash,
        isHttps: !!this.opts.tls,
        caCert: this.opts.caCert,
      }),
    );

    // Pairing routes
    if (this.opts.pairing) {
      this.app.route("/api/pairing", createPairingRoutes(this.opts.pairing));
    }

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

    if (this.opts.pluginsDir) {
      this.app.route("/api/plugins", createPluginInstallRoutes({
        pluginsDir: this.opts.pluginsDir,
        registry: this.opts.pluginRegistry,
        onInstalled: this.opts.onPluginInstalled,
      }));
    }

    if (store) {
      this.app.route("/api/ha", createHaRoutes(store));
    }

    if (getPresets) {
      this.app.get("/api/status/presets", (c) => c.json(getPresets()));
    }

    this.app.route(
      "/api",
      createStatusRoutes({
        getAgents: () => agentServer?.getConnectedAgents() ?? [],
        getPluginStatuses: () => {
          const statuses = getPluginStatuses?.() ?? [];
          const registry = this.opts.pluginRegistry;
          if (!registry) return statuses;
          return statuses.map((s: Record<string, unknown>) => {
            const manifest = registry.getManifest(s.id as string);
            if (manifest?.downloads?.length) {
              return { ...s, downloads: manifest.downloads };
            }
            return s;
          });
        },
        getPluginCatalog: this.opts.pluginHost ? () => this.opts.pluginHost!.getPluginCatalog() : undefined,
        getDeckPreview: () => getDeckPreview?.() ?? Promise.resolve({}),
        pressKey: async (key) => {
          if (pressKey) await pressKey(key);
          else log.info({ key }, "Browser simulated key press (no deck)");
        },
        getActiveMode: store ? () => ({
          id: (store.get("omnideck-core", "active_mode") as string | null) ?? null,
          name: (store.get("omnideck-core", "active_mode_name") as string | null) ?? null,
          icon: (store.get("omnideck-core", "active_mode_icon") as string | null) ?? null,
        }) : undefined,
        debugModes: this.opts.debugModes,
        getModeHistory: this.opts.getModeHistory,
        getWsConnectionCount: () => broadcaster?.size ?? 0,
        getAgentCount: () => agentServer?.getConnectedAgents()?.length ?? 0,
        getModeOverride: this.opts.getModeOverride,
      }),
    );

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
      this.setupWss(this.wss, broadcaster);

      // Also set up a WSS for the HTTPS server
      if (this.opts.tls) {
        this.wssHttps = new WebSocketServer({ noServer: true });
        this.setupWss(this.wssHttps, broadcaster);
      }
    }
  }

  private setupWss(wss: WebSocketServer, broadcaster: Broadcaster): void {
    wss.on("connection", (ws: WebSocket) => {
      broadcaster.add(ws as unknown as Parameters<Broadcaster["add"]>[0]);
      log.info("Browser WebSocket connected");

      // Replay buffered log lines to the new client
      replayLogs((line) => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "log:line", data: line }));
        }
      });

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

  private attachUpgradeHandler(
    server: { on(event: string, listener: (...args: unknown[]) => void): void },
    wss: WebSocketServer,
  ): void {
    server.on("upgrade", (req: unknown, socket: unknown, head: unknown) => {
      const reqHttp = req as { url?: string };
      if (reqHttp.url === "/ws") {
        wss.handleUpgrade(
          req as Parameters<WebSocketServer["handleUpgrade"]>[0],
          socket as Parameters<WebSocketServer["handleUpgrade"]>[1],
          head as Parameters<WebSocketServer["handleUpgrade"]>[2],
          (ws) => {
            wss.emit("connection", ws, req);
          },
        );
      } else {
        (socket as { destroy(): void }).destroy();
      }
    });
  }

  async start(): Promise<number> {
    return new Promise((resolve) => {
      // Start HTTP server
      this.server = serve(
        { fetch: this.app.fetch, port: this.opts.port, hostname: "0.0.0.0" },
        (info) => {
          if (this.wss) {
            this.attachUpgradeHandler(
              this.server as unknown as { on(event: string, listener: (...args: unknown[]) => void): void },
              this.wss,
            );
          }
          log.info({ port: info.port }, "Web server started (HTTP)");
          resolve(info.port);
        },
      );

      // Start HTTPS server if TLS is configured
      if (this.opts.tls) {
        const httpsPort = this.opts.httpsPort ?? 9443;
        this.httpsServer = createHttpsServer(
          { cert: this.opts.tls.cert, key: this.opts.tls.key },
          (req, res) => {
            // Let Hono handle HTTP requests on HTTPS
            const handleResponse = async () => {
              const response = await this.app.fetch(
                new Request(`https://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, {
                  method: req.method,
                  headers: Object.fromEntries(
                    Object.entries(req.headers).filter(([, v]) => v !== undefined) as [string, string][],
                  ),
                  body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : req as unknown as ReadableStream,
                  // @ts-expect-error duplex is needed for node request bodies
                  duplex: "half",
                }),
              );
              res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
              const body = response.body;
              if (body) {
                const reader = body.getReader();
                const pump = async (): Promise<void> => {
                  const { done, value } = await reader.read();
                  if (done) { res.end(); return; }
                  res.write(value);
                  return pump();
                };
                await pump();
              } else {
                res.end();
              }
            };
            handleResponse().catch((err: unknown) => {
              log.error({ err }, "HTTPS request handler error");
              res.writeHead(500);
              res.end("Internal Server Error");
            });
          },
        );

        if (this.wssHttps) {
          this.attachUpgradeHandler(this.httpsServer, this.wssHttps);
        }

        this.httpsServer.listen(httpsPort, "0.0.0.0", () => {
          log.info({ port: httpsPort }, "Web server started (HTTPS)");
        });
      }
    });
  }

  async stop(): Promise<void> {
    if (this.wss) {
      await new Promise<void>((resolve) => this.wss!.close(() => resolve()));
      this.wss = null;
    }
    if (this.wssHttps) {
      await new Promise<void>((resolve) => this.wssHttps!.close(() => resolve()));
      this.wssHttps = null;
    }
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
    if (this.httpsServer) {
      await new Promise<void>((resolve) => this.httpsServer!.close(() => resolve()));
      this.httpsServer = null;
    }
  }

  get hono(): Hono {
    return this.app;
  }
}

import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { createLogger } from "../logger.js";

const log = createLogger("web");

interface WebServerOptions {
  port: number;
  staticDir?: string;
}

export class WebServer {
  private app: Hono;
  private server: ServerType | null = null;
  private opts: WebServerOptions;

  constructor(opts: WebServerOptions) {
    this.opts = opts;
    this.app = new Hono();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get("/api/health", (c) => c.json({ status: "ok" }));

    // 404 for unknown /api/* routes
    this.app.notFound((c) => {
      if (c.req.path.startsWith("/api/")) {
        return c.json({ error: "Not found" }, 404);
      }
      return c.json({ error: "Not found" }, 404);
    });
  }

  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server = serve(
        { fetch: this.app.fetch, port: this.opts.port },
        (info) => {
          log.info({ port: info.port }, "Web server started");
          resolve(info.port);
        }
      );
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }

  get hono(): Hono {
    return this.app;
  }
}

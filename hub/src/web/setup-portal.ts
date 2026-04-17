import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { createLogger } from "../logger.js";
import { isApActive, SETUP_AP_IP } from "../services/network.js";

const log = createLogger("portal");

const CAPTIVE_PORT = parseInt(process.env["OMNIDECK_PORTAL_PORT"] ?? "80", 10);
const POLL_INTERVAL_MS = 15_000;
const DISABLED = CAPTIVE_PORT === 0;

/**
 * Hosts that captive-portal detection probes hit. When we return 302 to /setup
 * instead of the expected payload, iOS/Android pop the captive portal UI.
 * We serve everything on :80 — phones hit us because NM's dnsmasq is configured
 * to resolve all names to us (see deploy/nm-dnsmasq-shared-omnideck.conf).
 */

/**
 * Runs a tiny HTTP listener on :80 while the omnideck-setup-ap connection is
 * active. All requests are redirected to the setup page served on the hub's
 * primary HTTP port.
 */
export class SetupPortal {
  private server: Server | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private readonly hubPort: number) {}

  start(): void {
    if (DISABLED) {
      log.info("captive portal disabled (OMNIDECK_PORTAL_PORT=0)");
      return;
    }
    void this.tick();
    this.pollTimer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    if (this.pollTimer.unref) this.pollTimer.unref();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await this.closeServer();
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    let active = false;
    try {
      active = await isApActive();
    } catch (err) {
      log.warn({ err }, "isApActive failed");
      return;
    }

    if (active && !this.server) {
      this.openServer();
    } else if (!active && this.server) {
      await this.closeServer();
    }
  }

  private openServer(): void {
    const redirectUrl = `http://${SETUP_AP_IP}:${this.hubPort}/setup`;

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      // Captive portal: respond with a redirect so iOS/Android pop the portal UI.
      res.writeHead(302, { Location: redirectUrl, "Cache-Control": "no-store" });
      res.end(`<html><body><a href="${redirectUrl}">OmniDeck setup</a></body></html>`);
    });

    server.on("error", (err) => {
      log.warn({ err: (err as Error).message }, "portal :80 listen error");
      this.server = null;
    });

    try {
      server.listen(CAPTIVE_PORT, "0.0.0.0", () => {
        log.info({ port: CAPTIVE_PORT, redirectUrl }, "captive portal listener started");
      });
      this.server = server;
    } catch (err) {
      log.warn({ err }, "failed to bind :80 (need CAP_NET_BIND_SERVICE?)");
    }
  }

  private closeServer(): Promise<void> {
    if (!this.server) return Promise.resolve();
    const srv = this.server;
    this.server = null;
    return new Promise((resolve) => {
      srv.close(() => {
        log.info("captive portal listener stopped");
        resolve();
      });
    });
  }
}

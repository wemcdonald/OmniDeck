import { Bonjour } from "bonjour-service";
import type { Browser } from "bonjour-service";
import type { Service } from "bonjour-service";
import { createLogger } from "./logger.js";

const log = createLogger("mdns");

export interface HubEndpoint {
  /** Raw mDNS service name — may be suffixed on collision, so not stable across networks. */
  serviceName: string;
  /** Human-readable hub name from the advertised TXT record. */
  name: string;
  address: string;
  port: number;
  /** SHA-256 fingerprint of the hub's CA cert, from TXT `fp`. */
  fingerprint?: string;
}

type Listener = (ep: HubEndpoint) => void;

/**
 * Continuous mDNS browse for `_omnideck-hub._tcp`. Subscribers get notified
 * whenever a hub with a specific fingerprint appears on the local network or
 * disappears. Each Agent instance shares a single resolver — it's idempotent
 * across start() calls.
 */
export class HubResolver {
  private bonjour: Bonjour | null = null;
  private browser: Browser | null = null;
  private byFingerprint = new Map<string, HubEndpoint>();
  private upListeners = new Map<string, Listener[]>();
  private downListeners = new Map<string, Listener[]>();

  start(): void {
    if (this.bonjour) return;
    this.bonjour = new Bonjour();
    this.browser = this.bonjour.find({ type: "omnideck-hub" });

    this.browser.on("up", (service: Service) => {
      const ep = toEndpoint(service);
      if (!ep) return;
      log.info("Hub up", { name: ep.name, fp: ep.fingerprint?.slice(0, 16), address: ep.address });
      if (!ep.fingerprint) return; // can't key it without a fingerprint
      this.byFingerprint.set(ep.fingerprint, ep);
      for (const cb of this.upListeners.get(ep.fingerprint) ?? []) {
        try { cb(ep); } catch (err) { log.error("up listener threw", { err: String(err) }); }
      }
    });

    this.browser.on("down", (service: Service) => {
      const ep = toEndpoint(service);
      if (!ep || !ep.fingerprint) return;
      log.info("Hub down", { name: ep.name, fp: ep.fingerprint.slice(0, 16) });
      this.byFingerprint.delete(ep.fingerprint);
      for (const cb of this.downListeners.get(ep.fingerprint) ?? []) {
        try { cb(ep); } catch (err) { log.error("down listener threw", { err: String(err) }); }
      }
    });

    this.browser.start();
  }

  stop(): void {
    this.browser?.stop();
    this.bonjour?.destroy();
    this.browser = null;
    this.bonjour = null;
    this.byFingerprint.clear();
    this.upListeners.clear();
    this.downListeners.clear();
  }

  /** Current known endpoint for a fingerprint, if we've seen its hub recently. */
  get(fingerprint: string): HubEndpoint | undefined {
    return this.byFingerprint.get(fingerprint);
  }

  onUp(fingerprint: string, cb: Listener): () => void {
    const list = this.upListeners.get(fingerprint) ?? [];
    list.push(cb);
    this.upListeners.set(fingerprint, list);
    // Fire synchronously if we already have a matching endpoint.
    const existing = this.byFingerprint.get(fingerprint);
    if (existing) {
      queueMicrotask(() => cb(existing));
    }
    return () => {
      const current = this.upListeners.get(fingerprint);
      if (!current) return;
      const idx = current.indexOf(cb);
      if (idx >= 0) current.splice(idx, 1);
    };
  }

  onDown(fingerprint: string, cb: Listener): () => void {
    const list = this.downListeners.get(fingerprint) ?? [];
    list.push(cb);
    this.downListeners.set(fingerprint, list);
    return () => {
      const current = this.downListeners.get(fingerprint);
      if (!current) return;
      const idx = current.indexOf(cb);
      if (idx >= 0) current.splice(idx, 1);
    };
  }
}

function toEndpoint(service: Service): HubEndpoint | null {
  if (!service.port) return null;
  let address = service.referer?.address ?? service.host;
  if (address && !address.includes(".") && !address.includes(":")) {
    address = `${address}.local`;
  }
  if (!address) return null;

  const txt = (service.txt as Record<string, string> | undefined) ?? {};
  return {
    serviceName: service.name ?? "OmniDeck",
    name: txt.name ?? service.name ?? "OmniDeck",
    address,
    port: service.port,
    fingerprint: txt.fp,
  };
}

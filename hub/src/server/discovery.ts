import { Bonjour, type Service } from "bonjour-service";
import { createLogger } from "../logger.js";

const log = createLogger("discovery");

export interface DiscoveredAgent {
  hostname: string;
  address: string;
  port: number;
}

export interface HubDiscoveryOptions {
  port: number;
  name?: string;
  fingerprint?: string;
}

export class HubDiscovery {
  private bonjour: Bonjour;
  private agents = new Map<string, DiscoveredAgent>();
  private onDiscoverCbs: Array<(agent: DiscoveredAgent) => void> = [];
  private opts: HubDiscoveryOptions;

  constructor(opts: HubDiscoveryOptions) {
    this.bonjour = new Bonjour();
    this.opts = opts;
  }

  /** Advertise the hub so agents can find it */
  advertise(): void {
    const txt: Record<string, string> = {};
    if (this.opts.name) txt.name = this.opts.name;
    if (this.opts.fingerprint) txt.fp = this.opts.fingerprint;

    this.bonjour.publish({
      name: this.opts.name ?? "OmniDeck Hub",
      type: "omnideck-hub",
      port: this.opts.port,
      txt,
    });
    log.info({ port: this.opts.port, name: this.opts.name }, "Hub advertised via mDNS");
  }

  /** Browse for agents advertising as _omnideck-agent._tcp */
  browse(): void {
    this.bonjour.find({ type: "omnideck-agent" }, (service: Service) => {
      const agent: DiscoveredAgent = {
        hostname: service.host,
        address: service.referer?.address ?? service.host,
        port: service.port,
      };
      this.agents.set(agent.hostname, agent);
      log.info({ agent }, "Agent discovered");
      for (const cb of this.onDiscoverCbs) cb(agent);
    });
  }

  onDiscover(cb: (agent: DiscoveredAgent) => void): void {
    this.onDiscoverCbs.push(cb);
  }

  getDiscoveredAgents(): DiscoveredAgent[] {
    return Array.from(this.agents.values());
  }

  destroy(): void {
    this.bonjour.destroy();
  }
}

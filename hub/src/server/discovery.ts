import { Bonjour, type Service } from "bonjour-service";
import { createLogger } from "../logger.js";

const log = createLogger("discovery");

export interface DiscoveredAgent {
  hostname: string;
  address: string;
  port: number;
}

export class HubDiscovery {
  private bonjour: Bonjour;
  private agents = new Map<string, DiscoveredAgent>();
  private onDiscoverCbs: Array<(agent: DiscoveredAgent) => void> = [];
  private hubPort: number;

  constructor(hubPort: number) {
    this.bonjour = new Bonjour();
    this.hubPort = hubPort;
  }

  /** Advertise the hub so agents can find it */
  advertise(): void {
    this.bonjour.publish({
      name: "OmniDeck Hub",
      type: "omnideck-hub",
      port: this.hubPort,
    });
    log.info({ port: this.hubPort }, "Hub advertised via mDNS");
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

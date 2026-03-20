import { Agent } from "./agent.js";
import { createLogger } from "./logger.js";
import { loadCredentials, saveCredentials, deleteCredentials } from "./credentials.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";

const log = createLogger("main");

const CREDENTIALS_PATH = join(homedir(), ".omnideck-agent", "credentials.json");

interface DiscoveredHub {
  name: string;
  address: string;
  port: number;
  fingerprint?: string;
}

/**
 * Discover hubs on the local network via mDNS.
 * Returns the first hub found within a timeout, or null.
 */
async function discoverHub(timeoutMs = 10000): Promise<DiscoveredHub | null> {
  const { Bonjour } = await import("bonjour-service");
  const bonjour = new Bonjour();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      bonjour.destroy();
      resolve(null);
    }, timeoutMs);

    bonjour.find({ type: "omnideck-hub" }, (service) => {
      clearTimeout(timer);
      const hub: DiscoveredHub = {
        name: (service.txt as Record<string, string>)?.name ?? service.name ?? "OmniDeck",
        address: service.referer?.address ?? service.host,
        port: service.port,
        fingerprint: (service.txt as Record<string, string>)?.fp,
      };
      log.info("Hub discovered via mDNS", { name: hub.name, address: hub.address, port: hub.port });
      bonjour.destroy();
      resolve(hub);
    });

    log.info("Searching for OmniDeck Hub on the local network...");
  });
}

/** Prompt the user for input on stdin. */
function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const explicitUrl = process.env["OMNIDECK_HUB_URL"];
  const creds = loadCredentials(CREDENTIALS_PATH);

  if (creds) {
    // Reconnect with stored credentials
    const hubUrl = explicitUrl ?? creds.hub_address;
    log.info("Reconnecting with stored credentials", { hubUrl, agentId: creds.agent_id, hubName: creds.hub_name });

    const agent = new Agent({
      hubUrl,
      auth: { agentId: creds.agent_id, token: creds.token },
      caCert: creds.ca_cert,
      onAuthFailed: () => {
        log.warn("Token rejected — agent may have been revoked. Deleting credentials.");
        deleteCredentials(CREDENTIALS_PATH);
        log.info("Please restart the agent to re-pair.");
        process.exit(1);
      },
    });

    await agent.start();
    setupShutdown(agent);
    return;
  }

  // No credentials — need to discover hub and pair
  let hubUrl: string;
  let hubName = "OmniDeck";

  if (explicitUrl) {
    hubUrl = explicitUrl;
  } else {
    const hub = await discoverHub();
    if (!hub) {
      log.error("No OmniDeck Hub found on the local network.");
      log.error("Set OMNIDECK_HUB_URL environment variable to connect manually.");
      process.exit(1);
    }
    const protocol = "wss";
    hubUrl = `${protocol}://${hub.address}:${hub.port}`;
    hubName = hub.name;
    log.info(`Found hub "${hubName}" at ${hubUrl}`);
  }

  // Prompt for pairing code
  const code = await prompt(`Enter pairing code from ${hubName} web UI: `);
  if (!code) {
    log.error("No pairing code entered.");
    process.exit(1);
  }

  // Connect and pair
  const agent = new Agent({
    hubUrl,
    pairingCode: code,
    onPaired: (response) => {
      saveCredentials(CREDENTIALS_PATH, {
        agent_id: response.agent_id!,
        token: response.token!,
        hub_address: hubUrl,
        hub_name: response.hub_name ?? hubName,
        ca_cert: response.ca_cert,
      });
      log.info("Paired successfully! Credentials saved.", { agentId: response.agent_id });
    },
    onPairFailed: (error) => {
      log.error("Pairing failed", { error });
      process.exit(1);
    },
  });

  await agent.start();
  setupShutdown(agent);
}

function setupShutdown(agent: Agent) {
  const shutdown = () => {
    log.info("Shutting down...");
    agent.stop().then(() => process.exit(0)).catch(() => process.exit(1));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  log.error("Agent failed to start", { err: String(err) });
  process.exit(1);
});

import { Agent } from "./agent.js";
import { createLogger, setStderrOnly } from "./logger.js";
import { loadCredentials, saveCredentials, deleteCredentials } from "./credentials.js";
import {
  getCredentialsPath,
  ensureConfigDir,
  setConfigDirOverride,
} from "./config-dir.js";
import { createInterface } from "node:readline";

const log = createLogger("main");

// ── CLI argument parsing ────────────────────────────────────────────────────

interface CliArgs {
  managed: boolean;
  configDir?: string;
  pair: boolean;
  hubUrl?: string;
  pairCode?: string;
  discover: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { managed: false, pair: false, discover: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--managed":
        result.managed = true;
        break;
      case "--config-dir":
        result.configDir = args[++i];
        break;
      case "--pair":
        result.pair = true;
        break;
      case "--hub-url":
        result.hubUrl = args[++i];
        break;
      case "--pair-code":
        result.pairCode = args[++i];
        break;
      case "--discover":
        result.discover = true;
        break;
    }
  }
  return result;
}

// ── JSON IPC (managed mode) ─────────────────────────────────────────────────

function emit(event: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(event) + "\n");
}

// ── Hub discovery ───────────────────────────────────────────────────────────

interface DiscoveredHub {
  name: string;
  address: string;
  port: number;
  fingerprint?: string;
}

async function discoverHubs(
  opts: { firstOnly?: boolean; timeoutMs?: number; onHub?: (hub: DiscoveredHub) => void } = {},
): Promise<DiscoveredHub[]> {
  const { firstOnly = false, timeoutMs = 10000, onHub } = opts;
  const { Bonjour } = await import("bonjour-service");
  const bonjour = new Bonjour();
  const hubs: DiscoveredHub[] = [];

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      bonjour.destroy();
      resolve(hubs);
    }, timeoutMs);

    bonjour.find({ type: "omnideck-hub" }, (service) => {
      const hub: DiscoveredHub = {
        name: (service.txt as Record<string, string>)?.name ?? service.name ?? "OmniDeck",
        address: service.referer?.address ?? service.host,
        port: service.port,
        fingerprint: (service.txt as Record<string, string>)?.fp,
      };
      hubs.push(hub);
      onHub?.(hub);
      log.info("Hub discovered via mDNS", { name: hub.name, address: hub.address, port: hub.port });

      if (firstOnly) {
        clearTimeout(timer);
        bonjour.destroy();
        resolve(hubs);
      }
    });

    log.info("Searching for OmniDeck Hub on the local network...");
  });
}

// ── Interactive prompt (CLI mode only) ──────────────────────────────────────

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── Managed mode ────────────────────────────────────────────────────────────

async function runManaged(args: CliArgs) {
  setStderrOnly(true);
  const credsPath = getCredentialsPath();

  // Discover mode: find hubs and exit
  if (args.discover) {
    emit({ type: "status", state: "discovering" });
    await discoverHubs({
      firstOnly: false,
      timeoutMs: 10000,
      onHub: (hub) => emit({ type: "discovered", hub }),
    });
    emit({ type: "discover_done" });
    process.exit(0);
  }

  // Pair mode: non-interactive pairing
  if (args.pair) {
    if (!args.hubUrl || !args.pairCode) {
      emit({ type: "error", message: "--pair requires --hub-url and --pair-code" });
      process.exit(1);
    }

    emit({ type: "status", state: "pairing" });
    const agent = new Agent({
      hubUrl: args.hubUrl,
      pairingCode: args.pairCode,
      onPaired: (response) => {
        saveCredentials(credsPath, {
          agent_id: response.agent_id!,
          token: response.token!,
          hub_address: args.hubUrl!,
          hub_name: response.hub_name ?? "OmniDeck",
          ca_cert: response.ca_cert,
        });
        emit({
          type: "paired",
          agent_id: response.agent_id,
          hub_name: response.hub_name ?? "OmniDeck",
        });
      },
      onPairFailed: (error) => {
        emit({ type: "pair_failed", error });
        process.exit(1);
      },
    });

    await agent.start();
    setupShutdown(agent);
    return;
  }

  // Normal managed mode: connect with stored credentials
  const creds = loadCredentials(credsPath);

  if (!creds) {
    emit({ type: "status", state: "not_paired" });
    // In managed mode, don't prompt — wait for the Tauri shell to
    // restart us with --pair args after the user completes the pairing dialog.
    // Keep the process alive so the shell knows we're running.
    await new Promise(() => {}); // block forever
    return;
  }

  const hubUrl = process.env["OMNIDECK_HUB_URL"] ?? creds.hub_address;
  emit({ type: "status", state: "connecting" });

  const agent = new Agent({
    hubUrl,
    auth: { agentId: creds.agent_id, token: creds.token },
    caCert: creds.ca_cert,
    onConnected: () => {
      emit({ type: "status", state: "connected", hub: creds.hub_name, hub_url: hubUrl });
    },
    onDisconnected: (reason) => {
      emit({ type: "status", state: "disconnected", reason });
    },
    onReconnecting: () => {
      emit({ type: "status", state: "connecting" });
    },
    onAuthFailed: () => {
      deleteCredentials(credsPath);
      emit({ type: "auth_failed", message: "Token revoked — credentials deleted" });
      process.exit(1);
    },
  });

  await agent.start();
  setupShutdown(agent);
}

// ── CLI mode (original interactive flow) ────────────────────────────────────

async function runCli() {
  const credsPath = getCredentialsPath();
  const explicitUrl = process.env["OMNIDECK_HUB_URL"];
  const creds = loadCredentials(credsPath);

  if (creds) {
    const hubUrl = explicitUrl ?? creds.hub_address;
    log.info("Reconnecting with stored credentials", { hubUrl, agentId: creds.agent_id, hubName: creds.hub_name });

    const agent = new Agent({
      hubUrl,
      auth: { agentId: creds.agent_id, token: creds.token },
      caCert: creds.ca_cert,
      onAuthFailed: () => {
        log.warn("Token rejected — agent may have been revoked. Deleting credentials.");
        deleteCredentials(credsPath);
        log.info("Please restart the agent to re-pair.");
        process.exit(1);
      },
    });

    await agent.start();
    setupShutdown(agent);
    return;
  }

  // No credentials — discover and pair interactively
  let hubUrl: string;
  let hubName = "OmniDeck";

  if (explicitUrl) {
    hubUrl = explicitUrl;
  } else {
    const hubs = await discoverHubs({ firstOnly: true });
    const hub = hubs[0];
    if (!hub) {
      log.error("No OmniDeck Hub found on the local network.");
      log.error("Set OMNIDECK_HUB_URL environment variable to connect manually.");
      process.exit(1);
    }
    hubUrl = `wss://${hub.address}:${hub.port}`;
    hubName = hub.name;
    log.info(`Found hub "${hubName}" at ${hubUrl}`);
  }

  const code = await prompt(`Enter pairing code from ${hubName} web UI: `);
  if (!code) {
    log.error("No pairing code entered.");
    process.exit(1);
  }

  const agent = new Agent({
    hubUrl,
    pairingCode: code,
    onPaired: (response) => {
      saveCredentials(credsPath, {
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

// ── Shared ──────────────────────────────────────────────────────────────────

function setupShutdown(agent: Agent) {
  const shutdown = () => {
    log.info("Shutting down...");
    agent.stop().then(() => process.exit(0)).catch(() => process.exit(1));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ── Entry point ─────────────────────────────────────────────────────────────

const args = parseArgs();

// Apply config dir override before anything else
if (args.configDir) {
  setConfigDirOverride(args.configDir);
}
ensureConfigDir();

const main = args.managed ? runManaged(args) : runCli();

main.catch((err: unknown) => {
  if (args.managed) {
    emit({ type: "error", message: String(err) });
  } else {
    log.error("Agent failed to start", { err: String(err) });
  }
  process.exit(1);
});

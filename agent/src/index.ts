import { Agent } from "./agent.js";
import { createLogger, setStderrOnly } from "./logger.js";
import { loadHubs, addHub, removeHub, deleteAllHubs } from "./credentials.js";
import {
  getCredentialsPath,
  ensureConfigDir,
  setConfigDirOverride,
} from "./config-dir.js";
import { createInterface } from "node:readline";

const log = createLogger("main");

let currentAgent: Agent | null = null;

function handleUnpairCommand(agentId?: string): void {
  const agent = currentAgent;
  if (!agent) {
    emit({ type: "unpaired", success: false, error: "not_connected" });
    return;
  }
  agent.requestUnpair(agentId)
    .then(() => {
      // Drop the specific hub from the creds file (or the whole file if no
      // hubs remain). If no agentId was supplied we fall back to removing all.
      const credsPath = getCredentialsPath();
      if (agentId) removeHub(credsPath, agentId);
      else deleteAllHubs(credsPath);
      emit({ type: "unpaired", success: true, agent_id: agentId });
    })
    .catch((err: unknown) => {
      emit({ type: "unpaired", success: false, error: String(err) });
    });
}

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

// Platform request/response IPC: sidecar → Tauri (stdout) → Tauri (stdin) → sidecar
let requestIdCounter = 0;
const pendingPlatformRequests = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}>();

/**
 * Send a platform request to the Tauri host and wait for the response.
 * Only available in managed mode. Falls back to rejection in CLI mode.
 */
export function platformRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
  const id = `pr_${++requestIdCounter}`;
  return new Promise((resolve, reject) => {
    pendingPlatformRequests.set(id, { resolve, reject });
    emit({ type: "platform_request", id, method, params });
    setTimeout(() => {
      if (pendingPlatformRequests.delete(id)) {
        reject(new Error(`platformRequest "${method}" timed out`));
      }
    }, 10_000);
  });
}

function startStdinListener(): void {
  const stdin = process.stdin;
  if (!stdin || !stdin.readable) return;
  stdin.on("error", () => {});
  stdin.on("end", () => {});
  stdin.setEncoding("utf-8");
  stdin.resume();

  let buffer = "";
  stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (msg.type === "platform_response" && typeof msg.id === "string") {
          const pending = pendingPlatformRequests.get(msg.id);
          if (pending) {
            pendingPlatformRequests.delete(msg.id);
            if (msg.error) {
              pending.reject(new Error(msg.error as string));
            } else {
              pending.resolve(msg.result);
            }
          }
        } else if (msg.type === "unpair") {
          const agentId = typeof msg.agent_id === "string" ? msg.agent_id : undefined;
          handleUnpairCommand(agentId);
        }
      } catch {
        // Not JSON — ignore
      }
    }
  });
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
      // Prefer the IP address from referer, fall back to host
      // Ensure host has .local suffix for mDNS resolution
      let address = service.referer?.address ?? service.host;
      if (address && !address.includes(".") && !address.includes(":")) {
        // Bare hostname without domain — append .local for mDNS
        address = `${address}.local`;
      }
      const hub: DiscoveredHub = {
        name: (service.txt as Record<string, string>)?.name ?? service.name ?? "OmniDeck",
        address,
        port: service.port,
        fingerprint: (service.txt as Record<string, string>)?.fp,
      };

      if (!hub.address || !hub.port) {
        log.warn("Discovered hub with incomplete data, skipping", { address: hub.address, port: hub.port });
        return;
      }

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
  startStdinListener();
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
        addHub(credsPath, {
          agent_id: response.agent_id!,
          token: response.token!,
          hub_address: args.hubUrl!,
          hub_name: response.hub_name ?? "OmniDeck",
          ca_cert: response.ca_cert,
          cert_fingerprint_sha256: response.ca_fingerprint,
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

    currentAgent = agent;
    await agent.start();
    setupShutdown(agent);
    return;
  }

  // Normal managed mode: connect with every stored hub credential.
  const hubs = loadHubs(credsPath);

  if (hubs.length === 0) {
    emit({ type: "status", state: "not_paired" });
    // In managed mode, don't prompt — wait for the Tauri shell to
    // restart us with --pair args after the user completes the pairing dialog.
    // Keep the process alive so the shell knows we're running.
    await new Promise(() => {}); // block forever
    return;
  }

  // Per-hub address override via env var is legacy behaviour — it only makes
  // sense when exactly one hub is paired, so apply it only in that case.
  const envOverride = process.env["OMNIDECK_HUB_URL"];
  const effectiveHubs =
    envOverride && hubs.length === 1
      ? [{ ...hubs[0], hub_address: envOverride }]
      : hubs;

  emit({ type: "status", state: "connecting" });

  const agent = new Agent({
    credentialsList: effectiveHubs,
    platformRequest,
    onConnected: (hubName, hubUrl) => {
      emit({ type: "status", state: "connected", hub: hubName, hub_url: hubUrl });
    },
    onDisconnected: (reason) => {
      emit({ type: "status", state: "disconnected", reason });
    },
    onReconnecting: () => {
      emit({ type: "status", state: "connecting" });
    },
    onAuthFailed: (agentId) => {
      if (agentId) {
        removeHub(credsPath, agentId);
        emit({ type: "auth_failed", agent_id: agentId, message: "Token revoked for this hub" });
        // Only terminate the process if no paired hubs remain.
        const remaining = loadHubs(credsPath);
        if (remaining.length === 0) {
          emit({ type: "status", state: "not_paired" });
          process.exit(1);
        }
      } else {
        deleteAllHubs(credsPath);
        emit({ type: "auth_failed", message: "Token revoked — credentials deleted" });
        process.exit(1);
      }
    },
  });

  currentAgent = agent;
  await agent.start();
  setupShutdown(agent);
}

// ── CLI mode (original interactive flow) ────────────────────────────────────

async function runCli() {
  const credsPath = getCredentialsPath();
  const explicitUrl = process.env["OMNIDECK_HUB_URL"];
  const hubs = loadHubs(credsPath);

  if (hubs.length > 0) {
    // Reconnect to every paired hub. OMNIDECK_HUB_URL only applies when exactly
    // one hub is paired — it's a legacy override and ambiguous otherwise.
    const effectiveHubs =
      explicitUrl && hubs.length === 1
        ? [{ ...hubs[0], hub_address: explicitUrl }]
        : hubs;

    log.info("Reconnecting with stored credentials", {
      hubs: effectiveHubs.map((h) => ({ agentId: h.agent_id, hubName: h.hub_name, hubUrl: h.hub_address })),
    });

    const agent = new Agent({
      credentialsList: effectiveHubs,
      onAuthFailed: (agentId) => {
        if (agentId) {
          log.warn("Token revoked for hub — removing its credentials", { agentId });
          removeHub(credsPath, agentId);
          if (loadHubs(credsPath).length === 0) {
            log.info("No paired hubs remain — exiting.");
            process.exit(1);
          }
        } else {
          log.warn("Token rejected — agent may have been revoked. Deleting credentials.");
          deleteAllHubs(credsPath);
          process.exit(1);
        }
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
    const discovered = await discoverHubs({ firstOnly: true });
    const hub = discovered[0];
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
      addHub(credsPath, {
        agent_id: response.agent_id!,
        token: response.token!,
        hub_address: hubUrl,
        hub_name: response.hub_name ?? hubName,
        ca_cert: response.ca_cert,
        cert_fingerprint_sha256: response.ca_fingerprint,
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

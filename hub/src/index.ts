import { Hub } from "./hub.js";
import { createDeck } from "./deck/factory.js";
import { loadConfig } from "./config/loader.js";
import { validateConfig } from "./config/validator.js";
import { ensureTlsCerts } from "./server/tls.js";
import { createLogger, configureLogging } from "./logger.js";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const log = createLogger("main");

async function main() {
  const configDir =
    process.env["OMNIDECK_CONFIG_DIR"] ??
    join(homedir(), ".omnideck", "config");
  const secretsPath =
    process.env["OMNIDECK_SECRETS_PATH"] ??
    join(homedir(), ".omnideck", "secrets.yaml");

  log.info({ configDir }, "Loading config...");
  const rawConfig = await loadConfig(configDir, secretsPath);
  const config = validateConfig(rawConfig);
  configureLogging(config.logging ?? {});
  log.info({ pages: config.pages.length, devices: config.devices.length }, "Config loaded");

  // Generate/load TLS certificates
  const tlsDir = join(homedir(), ".omnideck", "tls");
  const tls = await ensureTlsCerts(tlsDir);

  const deck = await createDeck(config.deck.driver ?? "auto");
  const webPort = process.env["OMNIDECK_WEB_PORT"]
    ? parseInt(process.env["OMNIDECK_WEB_PORT"], 10)
    : 9211;
  const agentPort = process.env["OMNIDECK_AGENT_PORT"]
    ? parseInt(process.env["OMNIDECK_AGENT_PORT"], 10)
    : 9210;
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const pluginsDir =
    process.env["OMNIDECK_PLUGINS_DIR"] ??
    resolve(__dirname, "../../plugins");
  const agentsRegistryPath = join(homedir(), ".omnideck", "agents.yaml");

  const hub = new Hub({
    deck,
    configDir,
    pluginsDir,
    webPort,
    agentPort,
    tls: {
      cert: tls.serverCert,
      key: tls.serverKey,
      caCert: tls.caCert,
      caFingerprint: tls.caFingerprint,
    },
    hubName: config.hub?.name ?? "OmniDeck",
    agentsRegistryPath,
    authPasswordHash: config.auth?.password_hash,
    tlsRedirect: config.auth?.tls_redirect ?? false,
    httpsPort: 9443,
  });
  await hub.start(config.pages, config.plugins, config.modes, config.orchestrator, config.deck?.default_page);

  log.info("OmniDeck Hub running");

  // Graceful shutdown
  const shutdown = async () => {
    log.info("Shutting down...");
    await hub.stop();
    await deck.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log.error({ err }, "Fatal error");
  process.exit(1);
});

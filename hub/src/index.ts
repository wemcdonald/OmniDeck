import { Hub } from "./hub.js";
import { PhysicalDeck } from "./deck/manager.js";
import { loadConfig } from "./config/loader.js";
import { validateConfig } from "./config/validator.js";
import { createLogger } from "./logger.js";
import { join } from "node:path";
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
  log.info({ pages: config.pages.length, devices: config.devices.length }, "Config loaded");

  const deck = new PhysicalDeck();
  const webPort = process.env["OMNIDECK_WEB_PORT"]
    ? parseInt(process.env["OMNIDECK_WEB_PORT"], 10)
    : 9211;
  const hub = new Hub({ deck, configDir, webPort });
  await hub.start(config.pages);

  log.info("OmniDeck Hub running");

  // Graceful shutdown
  const shutdown = async () => {
    log.info("Shutting down...");
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

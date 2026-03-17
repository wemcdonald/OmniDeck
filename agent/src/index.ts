import { Agent } from "./agent.js";
import { createLogger } from "./logger.js";

const log = createLogger("main");

const hubUrl =
  process.env["OMNIDECK_HUB_URL"] ?? "ws://omnideck.local:9200";

const agent = new Agent({ hubUrl });

agent.start().catch((err: unknown) => {
  log.error("Agent failed to start", { err: String(err) });
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  log.info("Shutting down...");
  agent.stop().then(() => process.exit(0)).catch(() => process.exit(1));
});

process.on("SIGTERM", () => {
  log.info("Shutting down...");
  agent.stop().then(() => process.exit(0)).catch(() => process.exit(1));
});

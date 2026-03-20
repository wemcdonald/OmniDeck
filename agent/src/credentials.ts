import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { createLogger } from "./logger.js";

const log = createLogger("credentials");

export interface AgentCredentials {
  agent_id: string;
  token: string;
  hub_address: string;
  hub_name: string;
  ca_cert?: string;
}

/**
 * Load agent credentials from a YAML-like file.
 * Returns null if the file doesn't exist.
 */
export function loadCredentials(path: string): AgentCredentials | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const creds = JSON.parse(raw) as AgentCredentials;
    if (!creds.agent_id || !creds.token) {
      log.warn("Credentials file missing required fields");
      return null;
    }
    return creds;
  } catch (err) {
    log.error("Failed to load credentials", { err: String(err) });
    return null;
  }
}

/**
 * Save agent credentials.
 */
export function saveCredentials(
  path: string,
  creds: AgentCredentials,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(creds, null, 2), { mode: 0o600 });
  log.info("Credentials saved");
}

/**
 * Delete credentials (e.g., after token revocation).
 */
export function deleteCredentials(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
    log.info("Credentials deleted");
  }
}

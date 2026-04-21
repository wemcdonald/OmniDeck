import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { createLogger } from "./logger.js";

const log = createLogger("credentials");

/** Per-hub pairing record. An agent may be paired with multiple hubs. */
export interface AgentCredentials {
  agent_id: string;
  token: string;
  hub_address: string;
  hub_name: string;
  ca_cert?: string;
}

interface CredentialsFileV2 {
  version: 2;
  hubs: AgentCredentials[];
}

/**
 * Load the list of paired hubs from disk. Returns an empty array if the file
 * doesn't exist. Automatically migrates the legacy v1 shape (bare
 * AgentCredentials object) to a single-entry list in memory; the v2 shape is
 * written to disk on the next save.
 */
export function loadHubs(path: string): AgentCredentials[] {
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (isV2(parsed)) {
      return parsed.hubs.filter(isValidEntry);
    }
    // v1: bare AgentCredentials object
    if (isValidEntry(parsed)) {
      log.info("Migrating v1 credentials file to v2 list format on next save");
      return [parsed];
    }
    log.warn("Credentials file has unrecognized shape");
    return [];
  } catch (err) {
    log.error("Failed to load credentials", { err: String(err) });
    return [];
  }
}

/** Overwrite the credentials file with the given list. Always writes v2. */
export function saveHubs(path: string, hubs: AgentCredentials[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const payload: CredentialsFileV2 = { version: 2, hubs };
  writeFileSync(path, JSON.stringify(payload, null, 2), { mode: 0o600 });
  log.info("Credentials saved", { hubs: hubs.length });
}

/** Append or replace (by agent_id) a hub entry. */
export function addHub(path: string, entry: AgentCredentials): void {
  const hubs = loadHubs(path);
  const idx = hubs.findIndex((h) => h.agent_id === entry.agent_id);
  if (idx >= 0) hubs[idx] = entry;
  else hubs.push(entry);
  saveHubs(path, hubs);
}

/** Remove one hub by agent_id. If no hubs remain, the file is deleted. */
export function removeHub(path: string, agentId: string): void {
  const hubs = loadHubs(path).filter((h) => h.agent_id !== agentId);
  if (hubs.length === 0) {
    if (existsSync(path)) {
      unlinkSync(path);
      log.info("Credentials deleted (no hubs remain)");
    }
    return;
  }
  saveHubs(path, hubs);
}

/** Delete the entire credentials file. */
export function deleteAllHubs(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
    log.info("Credentials deleted");
  }
}

function isV2(x: unknown): x is CredentialsFileV2 {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { version?: unknown }).version === 2 &&
    Array.isArray((x as { hubs?: unknown }).hubs)
  );
}

function isValidEntry(x: unknown): x is AgentCredentials {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return typeof e.agent_id === "string" && typeof e.token === "string";
}

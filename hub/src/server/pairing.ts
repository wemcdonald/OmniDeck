import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { stringify as yamlStringify, parse as yamlParse } from "yaml";
import { createLogger } from "../logger.js";

const log = createLogger("pairing");

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity

export interface PairedAgent {
  agent_id: string;
  name: string;
  token_hash: string;
  platform: string;
  paired_at: string;
  last_seen?: string;
}

interface ActiveCode {
  code: string;
  expiresAt: Date;
  timer: ReturnType<typeof setTimeout>;
}

export class PairingManager {
  private activeCodes = new Map<string, ActiveCode>();
  private agents: PairedAgent[] = [];
  private registryPath: string;

  constructor(
    registryPath: string,
    private onChange?: (agents: PairedAgent[]) => void,
  ) {
    this.registryPath = registryPath;
    this.loadRegistry();
  }

  /**
   * Generate a short-lived pairing code (format: DECK-XXXX).
   */
  generateCode(): { code: string; expiresAt: Date } {
    // Generate 4 random characters
    const bytes = randomBytes(4);
    const suffix = Array.from(bytes)
      .map((b) => CODE_CHARS[b % CODE_CHARS.length])
      .join("");
    const code = `DECK-${suffix}`;
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    // Clean up any existing code with the same value (unlikely)
    const existing = this.activeCodes.get(code);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      this.activeCodes.delete(code);
      log.info({ code }, "Pairing code expired");
    }, CODE_TTL_MS);

    this.activeCodes.set(code, { code, expiresAt, timer });
    log.info({ code, expiresAt: expiresAt.toISOString() }, "Pairing code generated");
    return { code, expiresAt };
  }

  /**
   * Validate and consume a pairing code. Returns true if valid.
   * The code is single-use and removed after validation.
   */
  validateAndConsumeCode(code: string): boolean {
    const normalized = code.toUpperCase().trim();
    const entry = this.activeCodes.get(normalized);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt.getTime()) {
      this.activeCodes.delete(normalized);
      return false;
    }
    clearTimeout(entry.timer);
    this.activeCodes.delete(normalized);
    return true;
  }

  /**
   * Register a new agent after successful pairing.
   * Returns the agent ID and plaintext token (token is only returned once).
   */
  registerAgent(
    hostname: string,
    deviceName: string,
    platform: string,
  ): { agentId: string; token: string } {
    const agentId = randomUUID();
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);

    const agent: PairedAgent = {
      agent_id: agentId,
      name: deviceName || hostname,
      token_hash: tokenHash,
      platform,
      paired_at: new Date().toISOString(),
    };

    this.agents.push(agent);
    this.saveRegistry();
    log.info({ agentId, hostname, deviceName, platform }, "Agent registered");
    this.onChange?.(this.listAgents());
    return { agentId, token };
  }

  /**
   * Authenticate an agent by its token.
   * Returns the paired agent if valid, null otherwise.
   */
  authenticateAgent(token: string): PairedAgent | null {
    const hash = hashToken(token);
    return this.agents.find((a) => a.token_hash === hash) ?? null;
  }

  /**
   * Revoke a paired agent by ID.
   */
  revokeAgent(agentId: string): boolean {
    const idx = this.agents.findIndex((a) => a.agent_id === agentId);
    if (idx === -1) return false;
    const [removed] = this.agents.splice(idx, 1);
    this.saveRegistry();
    log.info({ agentId, name: removed.name }, "Agent revoked");
    this.onChange?.(this.listAgents());
    return true;
  }

  /**
   * Update the last_seen timestamp for an agent.
   */
  updateLastSeen(agentId: string): void {
    const agent = this.agents.find((a) => a.agent_id === agentId);
    if (agent) {
      agent.last_seen = new Date().toISOString();
      this.saveRegistry();
    }
  }

  listAgents(): PairedAgent[] {
    return this.agents.map((a) => ({
      ...a,
      token_hash: "[redacted]",
    }));
  }

  private loadRegistry(): void {
    if (!existsSync(this.registryPath)) {
      this.agents = [];
      return;
    }
    try {
      const raw = readFileSync(this.registryPath, "utf-8");
      this.agents = (yamlParse(raw) as PairedAgent[]) ?? [];
      log.info({ count: this.agents.length }, "Agent registry loaded");
    } catch (err) {
      log.error({ err }, "Failed to load agent registry");
      this.agents = [];
    }
  }

  private saveRegistry(): void {
    try {
      mkdirSync(dirname(this.registryPath), { recursive: true });
      writeFileSync(this.registryPath, yamlStringify(this.agents));
    } catch (err) {
      log.error({ err }, "Failed to save agent registry");
    }
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

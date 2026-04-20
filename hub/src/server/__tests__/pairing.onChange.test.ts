import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PairingManager, type PairedAgent } from "../pairing.js";

describe("PairingManager.onChange", () => {
  let dir: string;
  let calls: PairedAgent[][];
  let pm: PairingManager;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pairing-onchange-"));
    calls = [];
    pm = new PairingManager(join(dir, "agents.yaml"), (agents) => {
      calls.push(agents);
    });
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("fires onChange after registerAgent with redacted list", () => {
    const { code } = pm.generateCode();
    expect(pm.validateAndConsumeCode(code)).toBe(true);
    pm.registerAgent("host-a", "Host A", "macos");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(1);
    expect(calls[0][0].name).toBe("Host A");
    expect(calls[0][0].token_hash).toBe("[redacted]");
  });

  it("fires onChange after revokeAgent", () => {
    const { code } = pm.generateCode();
    pm.validateAndConsumeCode(code);
    const { agentId } = pm.registerAgent("host-a", "Host A", "macos");
    calls.length = 0; // reset
    pm.revokeAgent(agentId);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(0);
  });

  it("does NOT fire onChange for updateLastSeen", () => {
    const { code } = pm.generateCode();
    pm.validateAndConsumeCode(code);
    const { agentId } = pm.registerAgent("host-a", "Host A", "macos");
    calls.length = 0;
    pm.updateLastSeen(agentId);

    expect(calls).toHaveLength(0);
  });

  it("does nothing when revoking an unknown id", () => {
    pm.revokeAgent("no-such-agent");
    expect(calls).toHaveLength(0);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadHubs, saveHubs, addHub, removeHub, deleteAllHubs } from "../credentials.js";

describe("credentials", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "omnideck-creds-"));
    path = join(dir, "credentials.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("returns empty list when file missing", () => {
    expect(loadHubs(path)).toEqual([]);
  });

  it("round-trips a v2 list", () => {
    const hubs = [
      { agent_id: "a1", token: "t1", hub_address: "wss://h1", hub_name: "Home" },
      { agent_id: "a2", token: "t2", hub_address: "wss://h2", hub_name: "Work" },
    ];
    saveHubs(path, hubs);
    expect(loadHubs(path)).toEqual(hubs);
  });

  it("migrates a v1 bare-object file to a single-entry list in memory", () => {
    const v1 = { agent_id: "old", token: "tok", hub_address: "wss://h", hub_name: "Old Hub" };
    writeFileSync(path, JSON.stringify(v1));
    expect(loadHubs(path)).toEqual([v1]);
  });

  it("writes v2 shape even after loading a v1 file", () => {
    writeFileSync(path, JSON.stringify({ agent_id: "a", token: "t", hub_address: "wss://h", hub_name: "H" }));
    const hubs = loadHubs(path);
    saveHubs(path, hubs);
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as { version: number; hubs: unknown[] };
    expect(parsed.version).toBe(2);
    expect(parsed.hubs).toHaveLength(1);
  });

  it("addHub appends new and replaces existing by agent_id", () => {
    addHub(path, { agent_id: "a1", token: "t1", hub_address: "x", hub_name: "A" });
    addHub(path, { agent_id: "a2", token: "t2", hub_address: "y", hub_name: "B" });
    addHub(path, { agent_id: "a1", token: "t1-new", hub_address: "x", hub_name: "A" });
    const hubs = loadHubs(path);
    expect(hubs).toHaveLength(2);
    expect(hubs.find((h) => h.agent_id === "a1")?.token).toBe("t1-new");
  });

  it("removeHub removes the matching entry", () => {
    addHub(path, { agent_id: "a1", token: "t1", hub_address: "x", hub_name: "A" });
    addHub(path, { agent_id: "a2", token: "t2", hub_address: "y", hub_name: "B" });
    removeHub(path, "a1");
    const hubs = loadHubs(path);
    expect(hubs).toHaveLength(1);
    expect(hubs[0].agent_id).toBe("a2");
  });

  it("removeHub deletes the file when last hub is removed", () => {
    addHub(path, { agent_id: "a1", token: "t1", hub_address: "x", hub_name: "A" });
    removeHub(path, "a1");
    expect(existsSync(path)).toBe(false);
  });

  it("deleteAllHubs removes the file", () => {
    addHub(path, { agent_id: "a1", token: "t1", hub_address: "x", hub_name: "A" });
    deleteAllHubs(path);
    expect(existsSync(path)).toBe(false);
  });

  it("drops entries missing required fields", () => {
    const bad = { version: 2, hubs: [{ agent_id: "ok", token: "tok", hub_address: "x", hub_name: "X" }, { token: "no-id" }] };
    writeFileSync(path, JSON.stringify(bad));
    const hubs = loadHubs(path);
    expect(hubs).toHaveLength(1);
    expect(hubs[0].agent_id).toBe("ok");
  });
});

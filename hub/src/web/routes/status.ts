import { cpus, totalmem, freemem, uptime as osUptime, networkInterfaces } from "node:os";
import { memoryUsage, uptime as processUptime } from "node:process";
import { Hono } from "hono";

interface StatusRouteDeps {
  getAgents(): unknown[];
  getPluginStatuses(): unknown[];
  getPluginCatalog?(): unknown;
  getDeckPreview(): Promise<Record<number, string>>;
  pressKey(key: number): Promise<void>;
  getActiveMode?(): { id: string | null; name: string | null; icon: string | null };
  debugModes?(): unknown[];
  getModeHistory?(): unknown[];
  getModeOverride?(): string | null;
  getWsConnectionCount?(): number;
  getAgentCount?(): number;
}

export function createStatusRoutes(deps: StatusRouteDeps): Hono {
  const router = new Hono();

  router.get("/status/agents", (c) => c.json(deps.getAgents()));
  router.get("/status/plugins", (c) => c.json(deps.getPluginStatuses()));
  if (deps.getPluginCatalog) {
    const getCatalog = deps.getPluginCatalog;
    router.get("/status/plugin-catalog", (c) => c.json(getCatalog()));
  }
  router.get("/deck/preview", async (c) => c.json(await deps.getDeckPreview()));

  if (deps.getActiveMode) {
    const getActiveMode = deps.getActiveMode;
    router.get("/status/active-mode", (c) => c.json(getActiveMode()));
  }

  if (deps.debugModes) {
    const debugModes = deps.debugModes;
    router.get("/status/modes/debug", (c) => c.json(debugModes()));
  }

  if (deps.getModeHistory) {
    const getModeHistory = deps.getModeHistory;
    router.get("/status/modes/history", (c) => c.json(getModeHistory()));
  }

  if (deps.getModeOverride) {
    const getModeOverride = deps.getModeOverride;
    router.get("/status/modes/override", (c) => c.json({ override: getModeOverride() }));
  }

  router.post("/deck/press/:key", async (c) => {
    const key = parseInt(c.req.param("key"), 10);
    if (isNaN(key)) return c.json({ error: "Invalid key" }, 400);
    await deps.pressKey(key);
    return c.json({ ok: true });
  });

  // ── System telemetry (process-level) ──
  router.get("/status/telemetry", (c) => {
    const mem = memoryUsage();
    return c.json({
      rss_mb: Math.round(mem.rss / 1024 / 1024 * 10) / 10,
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024 * 10) / 10,
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024 * 10) / 10,
      ws_connections: deps.getWsConnectionCount?.() ?? 0,
      agent_connections: deps.getAgentCount?.() ?? 0,
      uptime_seconds: Math.floor(processUptime()),
    });
  });

  // ── System stats (OS-level) ──
  router.get("/status/system", (c) => {
    const cpuInfo = cpus();
    const cpuCount = cpuInfo.length;
    // Calculate average CPU usage from times
    let totalIdle = 0;
    let totalTick = 0;
    for (const cpu of cpuInfo) {
      const { user, nice, sys, idle, irq } = cpu.times;
      totalTick += user + nice + sys + idle + irq;
      totalIdle += idle;
    }
    const cpuPercent = cpuCount > 0
      ? Math.round((1 - totalIdle / totalTick) * 1000) / 10
      : 0;

    const totalMem = totalmem();
    const freeMem = freemem();
    const usedMem = totalMem - freeMem;

    // Get primary non-internal IPv4 address
    const nets = networkInterfaces();
    let deviceIp = "127.0.0.1";
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        if (net.family === "IPv4" && !net.internal) {
          deviceIp = net.address;
          break;
        }
      }
      if (deviceIp !== "127.0.0.1") break;
    }

    const uptimeSec = Math.floor(osUptime());
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const uptimeStr = days > 0
      ? `${days}d ${hours}h ${minutes}m`
      : hours > 0
        ? `${hours}h ${minutes}m`
        : `${minutes}m`;

    return c.json({
      cpu_percent: cpuPercent,
      cpu_count: cpuCount,
      ram_total_mb: Math.round(totalMem / 1024 / 1024),
      ram_used_mb: Math.round(usedMem / 1024 / 1024),
      ram_percent: Math.round(usedMem / totalMem * 1000) / 10,
      device_ip: deviceIp,
      uptime: uptimeStr,
      uptime_seconds: uptimeSec,
    });
  });

  return router;
}

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AgentState } from "../lib/api.ts";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import AgentCard from "../components/AgentCard.tsx";
import DeckPreview from "../components/DeckPreview.tsx";
import PluginHealthList from "../components/PluginHealthList.tsx";
import RecentLogs from "../components/RecentLogs.tsx";
import { SensorReadout } from "@/components/ui/sensor-readout";

interface PluginStatus {
  id: string;
  status: string;
  version: string;
  error?: string;
}

export default function Dashboard() {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [plugins, setPlugins] = useState<PluginStatus[]>([]);
  const { subscribe } = useWebSocket();
  // Track when each key was last updated via WS so query results don't clobber newer data
  const wsAgentsAt = useRef(0);
  const wsPluginsAt = useRef(0);

  // Initial fetch for agents & plugins (WS will keep them updated)
  const { data: agentsData } = useQuery({
    queryKey: ["status", "agents"],
    queryFn: () => api.status.agents().catch(() => [] as AgentState[]),
  });

  const { data: pluginsData } = useQuery({
    queryKey: ["status", "plugins"],
    queryFn: () => api.status.plugins().catch(() => [] as PluginStatus[]),
  });

  // Polling queries for telemetry and system stats
  const { data: telemetry } = useQuery({
    queryKey: ["status", "telemetry"],
    queryFn: () => api.status.telemetry().catch(() => null),
    refetchInterval: 5000,
  });

  const { data: systemStats } = useQuery({
    queryKey: ["status", "system"],
    queryFn: () => api.status.system().catch(() => null),
    refetchInterval: 5000,
  });

  // Sync query data to local state only if no newer WS update has arrived
  useEffect(() => {
    if (agentsData && wsAgentsAt.current === 0) setAgents(agentsData);
  }, [agentsData]);

  useEffect(() => {
    if (pluginsData && wsPluginsAt.current === 0) setPlugins(pluginsData);
  }, [pluginsData]);

  // WebSocket subscriptions for real-time updates
  useEffect(() => {
    const unsubAgents = subscribe("agent:update", (msg) => {
      wsAgentsAt.current = Date.now();
      setAgents(msg.data as AgentState[]);
    });
    const unsubPlugins = subscribe("plugin:status", (msg) => {
      wsPluginsAt.current = Date.now();
      setPlugins(msg.data as PluginStatus[]);
    });
    return () => {
      unsubAgents();
      unsubPlugins();
    };
  }, [subscribe]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display uppercase tracking-widest">Dashboard</h2>

      {/* Main grid: deck preview (2 cols) + right panel (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Deck Preview — spans 2 cols on large screens */}
        <section className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-display uppercase tracking-widest text-muted-foreground">
            Deck Preview
          </h3>
          <DeckPreview />
        </section>

        {/* Right panel: Agents + Plugins stacked */}
        <section className="space-y-6">
          {/* Connected Devices */}
          <div className="space-y-3">
            <h3 className="text-sm font-display uppercase tracking-widest text-muted-foreground">
              Connected Devices
            </h3>
            <div className="space-y-3">
              {agents.map((a) => (
                <AgentCard key={a.hostname} agent={a} />
              ))}
              {agents.length === 0 && (
                <div className="rounded border border-dashed border-outline-variant p-4 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">No agents connected</p>
                  <p className="text-xs text-muted-foreground">
                    Install the OmniDeck agent on your computer to get started.
                  </p>
                  <a
                    href="https://github.com/omnideck/omnideck/releases"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-xs text-primary hover:underline"
                  >
                    Download agent →
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Plugin Health */}
          <div className="space-y-3">
            <h3 className="text-sm font-display uppercase tracking-widest text-muted-foreground">
              Plugin Health
            </h3>
            <PluginHealthList plugins={plugins} />
          </div>
        </section>
      </div>

      {/* System Telemetry */}
      <section className="space-y-3">
        <h3 className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">
          System Telemetry
        </h3>
        {systemStats === undefined || systemStats === null ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <SensorReadout
              value={systemStats.cpu_percent}
              unit="%"
              label="CPU"
            />
            <SensorReadout
              value={systemStats.ram_used_mb}
              unit={`/ ${systemStats.ram_total_mb} MB`}
              label="RAM"
            />
            <SensorReadout
              value={telemetry?.rss_mb ?? "—"}
              unit="MB"
              label="Process RSS"
            />
            <SensorReadout
              value={telemetry?.ws_connections ?? 0}
              label="WS Clients"
            />
            <SensorReadout
              value={systemStats.device_ip}
              label="Device IP"
            />
            <SensorReadout
              value={systemStats.uptime}
              label="Uptime"
            />
          </div>
        )}
      </section>

      {/* Recent logs */}
      <RecentLogs />

      {/* Config Backup / Restore */}
      <section className="space-y-3">
        <h3 className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">
          Config Backup
        </h3>
        <BackupRestore />
      </section>
    </div>
  );
}

function BackupRestore() {
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  function handleExport() {
    window.location.href = "/api/backup";
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreStatus("Uploading…");
    try {
      const body = await file.arrayBuffer();
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body,
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || data.error) {
        setRestoreStatus(`Restore failed: ${data.error ?? "unknown error"}`);
      } else {
        setRestoreStatus(data.message ?? "Restored successfully.");
      }
    } catch (err) {
      setRestoreStatus(`Restore failed: ${String(err)}`);
    }
    e.target.value = "";
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={handleExport}
        className="rounded bg-surface-container-high border border-outline-variant px-3 py-1.5 text-sm font-medium hover:bg-surface-container-highest transition-colors"
      >
        Export config
      </button>
      <label className="rounded bg-surface-container-high border border-outline-variant px-3 py-1.5 text-sm font-medium hover:bg-surface-container-highest transition-colors cursor-pointer">
        Import config
        <input type="file" accept=".zip" className="hidden" onChange={handleImport} />
      </label>
      {restoreStatus && (
        <span className={`text-xs ${restoreStatus.startsWith("Restore failed") ? "text-destructive" : "text-muted-foreground"}`}>
          {restoreStatus}
        </span>
      )}
    </div>
  );
}

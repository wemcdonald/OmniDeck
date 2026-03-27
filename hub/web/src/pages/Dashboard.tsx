import { useEffect, useState } from "react";
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
  const [telemetry, setTelemetry] = useState<{ rss_mb: number; heap_used_mb: number; ws_connections: number; agent_connections: number; uptime_seconds: number } | null>(null);
  const [systemStats, setSystemStats] = useState<{ cpu_percent: number; ram_used_mb: number; ram_total_mb: number; ram_percent: number; device_ip: string; uptime: string } | null>(null);
  const { subscribe } = useWebSocket();

  async function load() {
    const [a, p, t, s] = await Promise.all([
      api.status.agents().catch(() => [] as AgentState[]),
      api.status.plugins().catch(() => [] as PluginStatus[]),
      api.status.telemetry().catch(() => null),
      api.status.system().catch(() => null),
    ]);
    setAgents(a);
    setPlugins(p);
    setTelemetry(t);
    setSystemStats(s);
  }

  useEffect(() => {
    void load();
    const unsubAgents = subscribe("agent:update", (msg) => {
      setAgents(msg.data as AgentState[]);
    });
    const unsubPlugins = subscribe("plugin:status", (msg) => {
      setPlugins(msg.data as PluginStatus[]);
    });
    return () => {
      unsubAgents();
      unsubPlugins();
    };
  }, [subscribe]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [t, s] = await Promise.all([api.status.telemetry(), api.status.system()]);
        setTelemetry(t);
        setSystemStats(s);
      } catch { /* ignore polling errors */ }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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
                <p className="text-muted-foreground text-sm">No agents connected</p>
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
        {systemStats === null ? (
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
    </div>
  );
}

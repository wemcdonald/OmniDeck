import { useEffect, useState } from "react";
import { api, type AgentState } from "../lib/api.ts";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import AgentCard from "../components/AgentCard.tsx";
import DeckPreview from "../components/DeckPreview.tsx";
import PluginHealthList from "../components/PluginHealthList.tsx";
import RecentLogs from "../components/RecentLogs.tsx";
import { EmptyState } from "@/components/ui/empty-state";

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

  async function load() {
    const [a, p] = await Promise.all([
      api.status.agents().catch(() => [] as AgentState[]),
      api.status.plugins().catch(() => [] as PluginStatus[]),
    ]);
    setAgents(a);
    setPlugins(p);
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
        <h3 className="text-sm font-display uppercase tracking-widest text-muted-foreground">
          System Telemetry
        </h3>
        <EmptyState
          title="Telemetry"
          description="System metrics available in a future update"
        />
      </section>

      {/* Recent logs */}
      <RecentLogs />
    </div>
  );
}

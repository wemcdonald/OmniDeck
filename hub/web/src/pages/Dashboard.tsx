import { useEffect, useState } from "react";
import { api, type AgentState } from "../lib/api.ts";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import AgentCard from "../components/AgentCard.tsx";
import DeckPreview from "../components/DeckPreview.tsx";
import PluginHealthList from "../components/PluginHealthList.tsx";
import RecentLogs from "../components/RecentLogs.tsx";

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
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* Agent status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((a) => (
          <AgentCard key={a.hostname} agent={a} />
        ))}
        {agents.length === 0 && (
          <p className="text-muted-foreground text-sm col-span-3">No agents connected</p>
        )}
      </div>

      {/* Deck preview + Plugin health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DeckPreview />
        <PluginHealthList plugins={plugins} />
      </div>

      {/* Recent logs */}
      <RecentLogs />
    </div>
  );
}

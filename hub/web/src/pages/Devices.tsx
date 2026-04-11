import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AgentState, type DeckInfo } from "../lib/api.ts";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import { Badge } from "@/components/ui/badge";
import { SensorReadout } from "@/components/ui/sensor-readout";

export default function Devices() {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [deckInfo, setDeckInfo] = useState<DeckInfo | null>(null);
  const { subscribe } = useWebSocket();

  const { data: deckData } = useQuery({
    queryKey: ["status", "deck"],
    queryFn: () => api.status.deck().catch(() => null),
  });

  const { data: agentsData } = useQuery({
    queryKey: ["status", "agents"],
    queryFn: () => api.status.agents().catch(() => [] as AgentState[]),
  });

  const { data: systemStats } = useQuery({
    queryKey: ["status", "system"],
    queryFn: () => api.status.system().catch(() => null),
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (deckData !== undefined) setDeckInfo(deckData);
  }, [deckData]);

  useEffect(() => {
    if (agentsData) setAgents(agentsData);
  }, [agentsData]);

  useEffect(() => {
    const unsubDeck = subscribe("deck:info", (msg) => {
      setDeckInfo(msg.data as DeckInfo);
    });
    const unsubAgents = subscribe("agent:update", (msg) => {
      setAgents(msg.data as AgentState[]);
    });
    return () => { unsubDeck(); unsubAgents(); };
  }, [subscribe]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold font-display">Devices</h2>

      <div>
        <h3 className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground mb-2">Connected Deck</h3>
        {deckInfo && deckInfo.driver !== "mock" ? (
          <div className="flex items-center gap-3 rounded-md border p-3 text-sm">
            <Badge variant="success">Connected</Badge>
            <span className="font-medium">{deckInfo.model}</span>
            <span className="text-muted-foreground">{deckInfo.keyCount} keys ({deckInfo.keyColumns} columns)</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-md border p-3 text-sm text-muted-foreground">
            <Badge variant="warning">No deck</Badge>
            <span>No physical deck connected</span>
          </div>
        )}
      </div>

      {agents.length === 0 && (
        <p className="text-sm text-muted-foreground">No agents connected.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 pr-4 text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Hostname</th>
              <th className="pb-2 pr-4 text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Platform</th>
              <th className="pb-2 pr-4 text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
              <th className="pb-2 pr-4 text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Idle</th>
              <th className="pb-2 pr-4 text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Active Window</th>
              <th className="pb-2 text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Version</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const idle = Math.round((a.idle_time_ms ?? 0) / 1000);
              const isIdle = idle > 30;
              return (
                <tr key={a.hostname} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium font-mono">{a.hostname}</td>
                  <td className="py-2 pr-4">{a.platform}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={isIdle ? "warning" : "success"}>
                      {isIdle ? "idle" : "active"}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">{idle}s</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {a.active_window_app ?? "—"}
                  </td>
                  <td className="py-2 font-mono text-muted-foreground">{a.agent_version}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Hub Metrics</h3>
      {systemStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SensorReadout value={systemStats.cpu_percent} unit="%" label="CPU" />
          <SensorReadout
            value={systemStats.ram_percent}
            unit="%"
            label={`RAM ${systemStats.ram_used_mb} / ${systemStats.ram_total_mb} MB`}
          />
          <SensorReadout value={systemStats.device_ip} label="IP" />
          <SensorReadout value={systemStats.uptime} label="Uptime" />
        </div>
      )}
    </div>
  );
}

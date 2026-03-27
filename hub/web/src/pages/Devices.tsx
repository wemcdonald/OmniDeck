import { useEffect, useState } from "react";
import { api, type AgentState } from "../lib/api.ts";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export default function Devices() {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    api.status.agents().then(setAgents).catch(console.error);
    const unsub = subscribe("agent:update", (msg) => {
      setAgents(msg.data as AgentState[]);
    });
    return unsub;
  }, [subscribe]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold font-display">Devices</h2>
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

      <h3 className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Resource Metrics</h3>
      <EmptyState title="Device metrics available in a future update" />
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, type AgentState } from "../lib/api.ts";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import { Badge } from "@/components/ui/badge";

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
      <h2 className="text-2xl font-bold">Devices</h2>
      {agents.length === 0 && (
        <p className="text-sm text-muted-foreground">No agents connected.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground text-left">
              <th className="pb-2 pr-4">Hostname</th>
              <th className="pb-2 pr-4">Platform</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Idle</th>
              <th className="pb-2 pr-4">Active Window</th>
              <th className="pb-2">Version</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const idle = Math.round((a.idle_time_ms ?? 0) / 1000);
              const isIdle = idle > 30;
              return (
                <tr key={a.hostname} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{a.hostname}</td>
                  <td className="py-2 pr-4">{a.platform}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={isIdle ? "secondary" : "default"}>
                      {isIdle ? "idle" : "active"}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">{idle}s</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {a.active_window_app ?? "—"}
                  </td>
                  <td className="py-2 text-muted-foreground">{a.agent_version}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

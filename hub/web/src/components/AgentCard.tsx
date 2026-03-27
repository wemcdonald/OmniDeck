import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AgentState } from "../lib/api.ts";

interface AgentCardProps {
  agent: AgentState;
}

export default function AgentCard({ agent }: AgentCardProps) {
  const isIdle = (agent.idle_time_ms ?? 0) > 30_000;
  const idleSec = Math.round((agent.idle_time_ms ?? 0) / 1000);

  return (
    <Card className="bg-surface-container rounded border border-outline-variant dark:border-outline">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono font-semibold text-base">{agent.hostname}</CardTitle>
          <Badge variant={isIdle ? "warning" : "success"}>
            {isIdle ? "idle" : "active"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-1">
        <div className="font-mono text-sm">{agent.platform}</div>
        <div className="font-mono text-sm">idle: {idleSec}s</div>
        {agent.active_window_app && <div className="font-mono text-sm">{agent.active_window_app}</div>}
        <div className="font-mono text-sm">v{agent.agent_version}</div>
      </CardContent>
    </Card>
  );
}

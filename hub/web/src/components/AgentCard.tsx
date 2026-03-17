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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{agent.hostname}</CardTitle>
          <Badge variant={isIdle ? "secondary" : "default"}>
            {isIdle ? "idle" : "active"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-1">
        <div>{agent.platform}</div>
        <div>idle: {idleSec}s</div>
        {agent.active_window_app && <div>{agent.active_window_app}</div>}
        <div>v{agent.agent_version}</div>
      </CardContent>
    </Card>
  );
}

import { useEffect, useState } from "react";
import { api, type AgentState } from "../lib/api";
import { useWebSocket } from "./useWebSocket";

/**
 * Shared hook that fetches connected agents and subscribes to real-time updates.
 */
export function useAgents(): AgentState[] {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    api.status.agents().then(setAgents).catch(() => {});

    const unsub = subscribe("agent:update", (msg) => {
      setAgents(msg.data as AgentState[]);
    });
    return unsub;
  }, [subscribe]);

  return agents;
}

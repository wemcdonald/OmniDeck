import { useEffect, useRef, useState } from "react";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";

interface LogLine {
  ts: string;
  level: string;
  name: string;
  msg: string;
}

const LEVEL_COLORS: Record<string, string> = {
  info: "text-primary",
  warn: "text-warning",
  error: "text-destructive",
};

export default function RecentLogs() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsub = subscribe("log:line", (msg) => {
      const line = msg.data as LogLine;
      setLines((prev) => [...prev.slice(-49), line]);
    });
    return unsub;
  }, [subscribe]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <Card className="bg-surface-container rounded border border-outline-variant dark:border-outline">
      <div className="px-6 pt-6 pb-2 flex items-center justify-between">
        <h3 className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">
          Recent Activity
        </h3>
        <Link to="/logs" className="text-xs text-primary hover:underline">
          View all →
        </Link>
      </div>
      <CardContent>
        <div className="font-mono text-xs space-y-0.5 max-h-48 overflow-y-auto">
          {lines.length === 0 && (
            <p className="text-muted-foreground">No log lines yet</p>
          )}
          {lines.map((line, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground shrink-0">
                {new Date(line.ts).toLocaleTimeString()}
              </span>
              <span className={`shrink-0 ${LEVEL_COLORS[line.level] ?? ""}`}>
                {line.level.toUpperCase()}
              </span>
              <span className="text-muted-foreground shrink-0">[{line.name}]</span>
              <span className="truncate">{line.msg}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </CardContent>
    </Card>
  );
}

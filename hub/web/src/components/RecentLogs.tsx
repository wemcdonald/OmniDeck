import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";

interface LogLine {
  seq: number;
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
  const { subscribe } = useWebSocket();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubHistory = subscribe("log:history", (msg) => {
      const history = msg.data as LogLine[];
      setLines(history.slice(-50));
    });
    const unsubLine = subscribe("log:line", (msg) => {
      setLines((prev) => {
        const incoming = msg.data as LogLine;
        if (prev.some((l) => l.seq === incoming.seq)) return prev;
        return [...prev.slice(-49), incoming];
      });
    });
    return () => { unsubHistory(); unsubLine(); };
  }, [subscribe]);

  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
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
        {/*
          flex-col-reverse: newest items render at the bottom visually,
          and the scroll position naturally starts at the bottom with no JS needed.
          Items are stored oldest-first so we reverse in CSS only.
        */}
        <div ref={scrollRef} className="font-mono text-xs max-h-48 overflow-y-auto flex flex-col-reverse [scroll-behavior:auto] [overflow-anchor:none]">
          <div className="flex flex-col gap-0.5">
            {lines.length === 0 && (
              <p className="text-muted-foreground">No log lines yet</p>
            )}
            {lines.map((line) => (
              <div key={line.seq} className="flex gap-2">
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

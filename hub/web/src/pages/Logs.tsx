import { useEffect, useMemo, useRef, useState } from "react";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import { Button } from "@/components/ui/button";

interface LogLine {
  seq?: number;
  ts: string;
  level: string;
  name: string;
  msg: string;
  [k: string]: unknown;
}

const MAX_LINES = 2000;

const LEVEL_COLORS: Record<string, string> = {
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
  debug: "text-gray-400",
};

export default function Logs() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [nameFilter, setNameFilter] = useState<string>("all");
  const [paused, setPaused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const unsub = subscribe("log:line", (msg) => {
      if (pausedRef.current) return;
      setLines((prev) => {
        const incoming = msg.data as LogLine;
        if (incoming.seq !== undefined && prev.some((l) => l.seq === incoming.seq)) return prev;
        const next = [...prev, incoming];
        return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
      });
    });
    return unsub;
  }, [subscribe]);

  // Auto-scroll to bottom when not paused
  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lines, paused]);

  const names = useMemo(() => {
    const set = new Set<string>();
    for (const l of lines) set.add(l.name);
    return Array.from(set).sort();
  }, [lines]);

  const filtered = useMemo(() => {
    return lines.filter((l) => {
      if (levelFilter !== "all" && l.level !== levelFilter) return false;
      if (nameFilter !== "all" && l.name !== nameFilter) return false;
      return true;
    });
  }, [lines, levelFilter, nameFilter]);

  function download() {
    const content = lines.map((l) => JSON.stringify(l)).join("\n");
    const blob = new Blob([content], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `omnideck-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.ndjson`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-2xl font-bold">Logs</h2>
        <select
          className="text-sm rounded border px-2 py-1 bg-background"
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
        >
          <option value="all">All levels</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
          <option value="debug">Debug</option>
        </select>
        <select
          className="text-sm rounded border px-2 py-1 bg-background"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        >
          <option value="all">All components</option>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => setPaused((v) => !v)}>
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button variant="outline" size="sm" onClick={download}>
          Download
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} / {MAX_LINES} lines
        </span>
      </div>

      <div className="flex-1 bg-muted/30 rounded border p-3 overflow-y-auto font-mono text-xs">
        {filtered.length === 0 && (
          <p className="text-muted-foreground italic">No log entries yet. Waiting for stream...</p>
        )}
        {filtered.map((line, i) => (
          <div key={i} className="flex gap-2 py-0.5 hover:bg-muted/50">
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {new Date(line.ts).toLocaleTimeString()}
            </span>
            <span className={`shrink-0 w-10 font-semibold ${LEVEL_COLORS[line.level] ?? ""}`}>
              {line.level.toUpperCase().slice(0, 4)}
            </span>
            <span className="text-muted-foreground shrink-0 w-20 truncate">[{line.name}]</span>
            <span>{line.msg}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

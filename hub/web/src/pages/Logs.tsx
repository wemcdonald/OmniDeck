import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import { Badge } from "@/components/ui/badge";
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

const LEVEL_ORDER: Record<string, number> = {
  trace: 10, debug: 20, info: 30, warn: 40, error: 50,
};

const LEVEL_VARIANT: Record<string, "success" | "warning" | "error" | "secondary"> = {
  info: "success",
  warn: "warning",
  error: "error",
  debug: "secondary",
};

export default function Logs() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [levelFilter, setLevelFilter] = useState<string>("warn");
  const [nameFilter, setNameFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [paused, setPaused] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const unsubHistory = subscribe("log:history", (msg) => {
      if (pausedRef.current) return;
      const history = (msg.data as LogLine[]).slice(-MAX_LINES);
      setLines(history);
    });
    const unsubLine = subscribe("log:line", (msg) => {
      if (pausedRef.current) return;
      setLines((prev) => {
        const incoming = msg.data as LogLine;
        if (incoming.seq !== undefined && prev.some((l) => l.seq === incoming.seq)) return prev;
        const next = [...prev, incoming];
        return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
      });
    });
    return () => { unsubHistory(); unsubLine(); };
  }, [subscribe]);

  // Auto-scroll to bottom when not paused
  useEffect(() => {
    if (!paused && scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [lines, paused]);

  const names = useMemo(() => {
    const set = new Set<string>();
    for (const l of lines) set.add(l.name);
    return Array.from(set).sort();
  }, [lines]);

  const filtered = useMemo(() => {
    const minLevel = levelFilter === "all" ? 0 : (LEVEL_ORDER[levelFilter] ?? 0);
    const lowerSearch = search.toLowerCase();
    return lines.filter((l) => {
      if (levelFilter !== "all" && (LEVEL_ORDER[l.level] ?? 0) < minLevel) return false;
      if (nameFilter !== "all" && l.name !== nameFilter) return false;
      if (lowerSearch && !l.msg.toLowerCase().includes(lowerSearch)) return false;
      return true;
    });
  }, [lines, levelFilter, nameFilter, search]);

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
        <h2 className="text-2xl font-bold font-display">Logs</h2>
        <select
          className="text-xs font-display rounded border px-2 py-1 bg-background"
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
        >
          <option value="all">All levels</option>
          <option value="trace">&ge; Trace</option>
          <option value="debug">&ge; Debug</option>
          <option value="info">&ge; Info</option>
          <option value="warn">&ge; Warn</option>
          <option value="error">&ge; Error</option>
        </select>
        <select
          className="text-xs font-display rounded border px-2 py-1 bg-background"
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
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs font-display rounded border px-2 py-1 bg-background w-40"
        />
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

      <div
        ref={scrollContainerRef}
        className="flex-1 bg-muted/30 rounded border p-3 overflow-y-auto font-mono text-xs"
      >
        {filtered.length === 0 && (
          <p className="text-muted-foreground italic">No log entries yet. Waiting for stream...</p>
        )}
        <LogVirtualList filtered={filtered} scrollContainerRef={scrollContainerRef} />
      </div>
    </div>
  );
}

interface LogVirtualListProps {
  filtered: LogLine[];
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

function LogVirtualList({ filtered, scrollContainerRef }: LogVirtualListProps) {
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 22,
    overscan: 20,
  });

  return (
    <div
      style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
    >
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const line = filtered[virtualRow.index];
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={rowVirtualizer.measureElement}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
            className="flex gap-2 py-0.5 hover:bg-muted/50"
          >
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {new Date(line.ts).toLocaleTimeString()}
            </span>
            <Badge variant={LEVEL_VARIANT[line.level] ?? "secondary"} className="shrink-0 w-10 justify-center font-mono">
              {line.level.toUpperCase().slice(0, 4)}
            </Badge>
            <span className="text-muted-foreground shrink-0 w-20 truncate">[{line.name}]</span>
            <span>{line.msg}</span>
          </div>
        );
      })}
    </div>
  );
}

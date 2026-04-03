import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLogStream } from "../hooks/useLogStream.ts";
import { LogList } from "../components/LogList.tsx";

const MAX_LINES = 2000;

const LEVEL_ORDER: Record<string, number> = {
  trace: 10, debug: 20, info: 30, warn: 40, error: 50,
};

export default function Logs() {
  const [levelFilter, setLevelFilter] = useState<string>("warn");
  const [nameFilter, setNameFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [paused, setPaused] = useState(false);

  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const lines = useLogStream(MAX_LINES, pausedRef);

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
      {/* Filter bar */}
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
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search…"
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

      <LogList lines={filtered} paused={paused} />
    </div>
  );
}

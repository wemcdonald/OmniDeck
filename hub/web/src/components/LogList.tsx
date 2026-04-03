// Virtualised log list.
//
// Rows are whitespace-nowrap so height is always LOG_ROW_HEIGHT — a constant.
// estimateSize never touches the DOM or canvas. The container overflows
// horizontally so long lines and agent names are always fully visible.

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { LOG_ROW_HEIGHT } from "../lib/logRowHeight.ts";
import { LogRow } from "./LogRow.tsx";
import type { LogLine } from "../hooks/useLogStream.ts";

interface LogListProps {
  lines: LogLine[];
  paused?: boolean;
  /** Tailwind max-height class for widget mode, e.g. "max-h-48". Omit for flex-1 full-height. */
  maxHeight?: string;
  className?: string;
}

export function LogList({ lines, paused, maxHeight, className }: LogListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LOG_ROW_HEIGHT,
    overscan: 20,
  });

  // Auto-scroll to bottom when not paused and lines change.
  useEffect(() => {
    if (!paused && lines.length > 0) {
      virtualizer.scrollToIndex(lines.length - 1, { align: "end" });
    }
  }, [lines, paused, virtualizer]);

  const heightClass = maxHeight ?? "flex-1";

  return (
    <div
      ref={scrollRef}
      className={`${heightClass} overflow-auto bg-muted/30 rounded border p-3 ${className ?? ""}`}
    >
      {lines.length === 0 && (
        <p className="text-muted-foreground italic text-xs font-mono">
          No log entries yet. Waiting for stream…
        </p>
      )}
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
      >
        {virtualizer.getVirtualItems().map((vRow) => (
          <LogRow
            key={vRow.key}
            line={lines[vRow.index]!}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vRow.start}px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

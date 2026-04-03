// Shared WebSocket log subscription hook.
//
// Handles both surfaces:
//   - Logs page:     useLogStream(2000, pausedRef)
//   - Dashboard:     useLogStream(50)
//
// Subscribes to log:history (full backlog on mount) AND log:line (live stream).
// Deduplicates by seq. Calls prepareLogLine() on each incoming line so canvas
// work is front-loaded here — estimateSize in the virtualizer stays O(1).

import { useEffect, useRef, useState, type RefObject } from "react";
import { useWebSocket } from "./useWebSocket.tsx";
import { prepareLogLine } from "../lib/logRowHeight.ts";

export interface LogLine {
  seq?: number;
  ts: string;
  level: string;
  name: string;
  msg: string;
  [k: string]: unknown;
}

export function useLogStream(
  maxLines: number,
  pausedRef?: RefObject<boolean>,
): LogLine[] {
  const [lines, setLines] = useState<LogLine[]>([]);
  const { subscribe } = useWebSocket();

  // Stable ref so the effect closure never captures a stale maxLines.
  const maxLinesRef = useRef(maxLines);
  maxLinesRef.current = maxLines;

  useEffect(() => {
    const isPaused = () => pausedRef?.current ?? false;

    const unsubHistory = subscribe("log:history", (msg) => {
      if (isPaused()) return;
      const history = (msg.data as LogLine[]).slice(-maxLinesRef.current);
      history.forEach(prepareLogLine);
      setLines(history);
    });

    const unsubLine = subscribe("log:line", (msg) => {
      if (isPaused()) return;
      const incoming = msg.data as LogLine;
      prepareLogLine(incoming);
      setLines((prev) => {
        // Deduplicate by seq when present.
        if (incoming.seq !== undefined && prev.some((l) => l.seq === incoming.seq)) {
          return prev;
        }
        const next = [...prev, incoming];
        return next.length > maxLinesRef.current
          ? next.slice(-maxLinesRef.current)
          : next;
      });
    });

    return () => {
      unsubHistory();
      unsubLine();
    };
  }, [subscribe, pausedRef]);

  return lines;
}

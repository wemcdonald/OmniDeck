// Virtualised log list backed by @chenglou/pretext height prediction.
//
// estimateSize uses logRowHeight() — pure O(1) arithmetic from pre-measured
// canvas data. No measureElement ref, no DOM reads per row, no flicker.
//
// ResizeObserver tracks the scroll container width so the msg column width
// stays accurate when the panel resizes.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { logRowHeight, LOG_ROW_FIXED_W } from "../lib/logRowHeight.ts";
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
  const [containerWidth, setContainerWidth] = useState(0);

  // Track container width with ResizeObserver.
  // rAF-debounced to avoid thrashing on continuous resize drags.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let rafId = 0;
    const ro = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setContainerWidth(entry!.contentRect.width);
      });
    });
    ro.observe(el);
    // Set initial width synchronously so first render has correct heights.
    setContainerWidth(el.getBoundingClientRect().width);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  const msgColWidth = Math.max(0, containerWidth - LOG_ROW_FIXED_W);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => logRowHeight(lines[i]!, msgColWidth),
    overscan: 20,
  });

  // Auto-scroll to bottom when not paused and lines change.
  useEffect(() => {
    if (!paused && lines.length > 0) {
      virtualizer.scrollToIndex(lines.length - 1, { align: "end" });
    }
  }, [lines, paused, virtualizer]);

  // Dev-mode calibration: warn if prediction diverges from actual heights.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (lines.length === 0 || containerWidth === 0) return;
    // Run once after first real render.
    const timer = setTimeout(() => {
      const items = scrollRef.current?.querySelectorAll("[data-index]");
      if (!items) return;
      let worst = 0;
      items.forEach((el) => {
        const idx = Number((el as HTMLElement).dataset.index);
        const line = lines[idx];
        if (!line) return;
        const actual = el.getBoundingClientRect().height;
        const predicted = logRowHeight(line, msgColWidth);
        worst = Math.max(worst, Math.abs(actual - predicted));
      });
      if (worst > 2) {
        console.warn(
          `[LogList] Height prediction off by up to ${worst.toFixed(1)}px. ` +
          `Check LOG_ROW_FONT in logRowHeight.ts matches the rendered CSS font.`,
        );
      }
    }, 500);
    return () => clearTimeout(timer);
  // Only run after initial populate, not on every line.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerWidth > 0 && lines.length > 0]);

  const heightClass = maxHeight ?? "flex-1";

  return (
    <div
      ref={scrollRef}
      className={`${heightClass} overflow-y-auto bg-muted/30 rounded border p-3 ${className ?? ""}`}
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

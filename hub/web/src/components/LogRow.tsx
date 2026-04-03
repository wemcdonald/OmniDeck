// Shared log row renderer used by both the Logs page and the dashboard widget.
//
// Rows are whitespace-nowrap — the container scrolls horizontally rather than
// wrapping. This means height is always constant (one line), so estimateSize
// can return a fixed value with no canvas measurement needed.

import { Badge } from "@/components/ui/badge";
import type { LogLine } from "../hooks/useLogStream.ts";

type BadgeVariant = "success" | "warning" | "error" | "secondary" | "default";

const LEVEL_VARIANT: Record<string, BadgeVariant> = {
  info:  "success",
  warn:  "warning",
  error: "error",
  debug: "secondary",
  trace: "secondary",
};

const LEVEL_LABEL: Record<string, string> = {
  trace: "TRACE",
  debug: "DEBUG",
  info:  "INFO",
  warn:  "WARN",
  error: "ERROR",
};

interface LogRowProps {
  line: LogLine;
  style?: React.CSSProperties;
}

export function LogRow({ line, style }: LogRowProps) {
  return (
    <div
      style={style}
      className="flex items-center gap-2 py-0.5 hover:bg-muted/50 font-mono text-xs whitespace-nowrap"
    >
      <span className="text-muted-foreground shrink-0 tabular-nums">
        {new Date(line.ts).toLocaleTimeString()}
      </span>

      <Badge
        variant={LEVEL_VARIANT[line.level] ?? "secondary"}
        className="shrink-0 w-12 justify-center"
      >
        {LEVEL_LABEL[line.level] ?? line.level.toUpperCase()}
      </Badge>

      <span className="text-muted-foreground shrink-0">
        [{line.name}]
      </span>

      <span>{line.msg}</span>
    </div>
  );
}

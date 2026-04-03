// Shared log row renderer used by both the Logs page and the dashboard widget.
//
// Column layout (matches fixed widths in logRowHeight.ts):
//   [timestamp 68px] [gap 8px] [badge 40px] [gap 8px] [[name] 80px] [gap 8px] [msg flex]

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
  style?: React.CSSProperties; // passed through from virtualizer positioning
}

export function LogRow({ line, style }: LogRowProps) {
  return (
    <div
      style={style}
      className="flex items-start gap-2 py-0.5 hover:bg-muted/50 font-mono text-xs"
    >
      {/* Timestamp — fixed 88px, no wrap */}
      <span className="text-muted-foreground shrink-0 w-[88px] tabular-nums whitespace-nowrap">
        {new Date(line.ts).toLocaleTimeString()}
      </span>

      {/* Level badge — fixed 48px (w-12) to fit "ERROR" */}
      <Badge
        variant={LEVEL_VARIANT[line.level] ?? "secondary"}
        className="shrink-0 w-12 justify-center"
      >
        {LEVEL_LABEL[line.level] ?? line.level.toUpperCase()}
      </Badge>

      {/* Component name — fixed 96px (w-24), truncated */}
      <span className="text-muted-foreground shrink-0 w-24 truncate">
        [{line.name}]
      </span>

      {/* Message — fills remaining width, may wrap */}
      <span className="min-w-0 break-words">{line.msg}</span>
    </div>
  );
}

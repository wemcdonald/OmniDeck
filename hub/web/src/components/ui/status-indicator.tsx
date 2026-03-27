import { cn } from "@/lib/utils";

type Status = "connected" | "disconnected" | "warning" | "error" | "idle";

const statusColors: Record<Status, string> = {
  connected: "bg-success",
  disconnected: "bg-destructive",
  warning: "bg-warning",
  error: "bg-destructive",
  idle: "bg-muted-foreground",
};

const statusLabels: Record<Status, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  warning: "Warning",
  error: "Error",
  idle: "Idle",
};

interface StatusIndicatorProps {
  status: Status;
  label?: string;
  showLabel?: boolean;
  className?: string;
}

export function StatusIndicator({
  status,
  label,
  showLabel = true,
  className,
}: StatusIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className={cn("h-2 w-2 rounded-full shrink-0", statusColors[status])}
      />
      {showLabel && (
        <span className="text-xs font-mono text-muted-foreground">
          {label ?? statusLabels[status]}
        </span>
      )}
    </div>
  );
}

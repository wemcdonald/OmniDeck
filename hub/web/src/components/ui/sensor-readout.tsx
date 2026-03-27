import { cn } from "@/lib/utils";

interface SensorReadoutProps {
  value: string | number;
  unit?: string;
  label: string;
  className?: string;
}

export function SensorReadout({ value, unit, label, className }: SensorReadoutProps) {
  return (
    <div
      className={cn(
        "bg-surface-container rounded border-l-[3px] border-l-primary px-4 py-3",
        className
      )}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold font-mono text-foreground">{value}</span>
        {unit && (
          <span className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      <span className="text-xs font-display uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

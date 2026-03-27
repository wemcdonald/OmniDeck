import type { ModeHistoryEntry } from "../lib/api.ts";

const COLORS = [
  "bg-blue-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-cyan-500",
];

interface Segment {
  mode: string;
  start: number; // ms timestamp
  end: number;   // ms timestamp
  color: string;
}

function formatRelative(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

interface Props {
  history: ModeHistoryEntry[];
}

export default function ModeHistoryTimeline({ history }: Props) {
  if (!history || history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No transitions recorded
      </p>
    );
  }

  // History arrives most-recent-first. Reverse to chronological order.
  const chronological = [...history].reverse();

  const now = Date.now();
  const colorMap = new Map<string, string>();
  let colorIdx = 0;

  function colorFor(mode: string): string {
    if (!colorMap.has(mode)) {
      colorMap.set(mode, COLORS[colorIdx % COLORS.length]);
      colorIdx++;
    }
    return colorMap.get(mode)!;
  }

  // Build segments: each transition tells us "at <timestamp>, mode changed to <to>"
  const segments: Segment[] = [];
  for (let i = 0; i < chronological.length; i++) {
    const entry = chronological[i];
    const mode = entry.to ?? "none";
    const start = new Date(entry.timestamp).getTime();
    const end = i < chronological.length - 1
      ? new Date(chronological[i + 1].timestamp).getTime()
      : now;

    if (end > start) {
      segments.push({
        mode,
        start,
        end,
        color: colorFor(mode),
      });
    }
  }

  if (segments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No transitions recorded
      </p>
    );
  }

  const timelineStart = segments[0].start;
  const timelineEnd = segments[segments.length - 1].end;
  const totalDuration = timelineEnd - timelineStart;

  if (totalDuration <= 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No transitions recorded
      </p>
    );
  }

  // Pick a few time labels spread across the bar
  const labelCount = Math.min(5, segments.length + 1);
  const timeLabels: { position: number; label: string }[] = [];
  for (let i = 0; i < labelCount; i++) {
    const t = timelineStart + (totalDuration * i) / (labelCount - 1 || 1);
    const ago = now - t;
    timeLabels.push({
      position: ((t - timelineStart) / totalDuration) * 100,
      label: formatRelative(ago),
    });
  }

  return (
    <div className="space-y-2">
      {/* Bar */}
      <div className="bg-surface-container rounded h-7 flex overflow-hidden">
        {segments.map((seg, i) => {
          const widthPct = ((seg.end - seg.start) / totalDuration) * 100;
          const showLabel = widthPct > 12;
          return (
            <div
              key={i}
              className={`${seg.color} relative flex items-center justify-center overflow-hidden transition-all`}
              style={{ width: `${widthPct}%` }}
              title={`${seg.mode} (${formatRelative(now - seg.start)} - ${formatRelative(now - seg.end)})`}
            >
              {showLabel && (
                <span className="text-[10px] font-display text-white truncate px-1">
                  {seg.mode}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Mode labels below for narrow segments */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {Array.from(colorMap.entries()).map(([mode, color]) => (
          <div key={mode} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
            <span className="text-[11px] font-display text-muted-foreground">{mode}</span>
          </div>
        ))}
      </div>

      {/* Time labels */}
      <div className="relative h-4">
        {timeLabels.map((tl, i) => (
          <span
            key={i}
            className="absolute text-[10px] font-mono text-muted-foreground -translate-x-1/2"
            style={{ left: `${tl.position}%` }}
          >
            {tl.label}
          </span>
        ))}
      </div>
    </div>
  );
}

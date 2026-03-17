import { Plus } from "lucide-react";
import type { ButtonConfig } from "../lib/api.ts";

interface ButtonGridProps {
  buttons: ButtonConfig[];
  columns: number;
  rows: number;
  selectedPos: [number, number] | null;
  onSelect(pos: [number, number]): void;
}

export default function ButtonGrid({
  buttons,
  columns,
  rows,
  selectedPos,
  onSelect,
}: ButtonGridProps) {
  const buttonMap = new Map<string, ButtonConfig>();
  for (const btn of buttons) {
    buttonMap.set(`${btn.pos[0]},${btn.pos[1]}`, btn);
  }

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {Array.from({ length: rows * columns }, (_, i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        const btn = buttonMap.get(`${col},${row}`);
        const isSelected =
          selectedPos?.[0] === col && selectedPos?.[1] === row;

        return (
          <button
            key={`${col},${row}`}
            onClick={() => onSelect([col, row])}
            className={`aspect-square rounded border-2 flex flex-col items-center justify-center p-1 text-xs transition-colors ${
              isSelected
                ? "border-primary bg-primary/10"
                : btn
                ? "border-border bg-muted hover:border-primary/50"
                : "border-dashed border-border hover:border-primary/50 bg-background"
            }`}
          >
            {btn ? (
              <>
                {btn.top_label && (
                  <span className="text-[9px] text-muted-foreground truncate w-full text-center leading-tight">
                    {btn.top_label}
                  </span>
                )}
                {btn.icon && (
                  <span className="text-lg leading-none">{btn.icon}</span>
                )}
                <span className="truncate w-full text-center leading-tight font-medium">
                  {btn.label ?? btn.preset ?? `${col},${row}`}
                </span>
              </>
            ) : (
              <Plus className="w-4 h-4 text-muted-foreground/40" />
            )}
          </button>
        );
      })}
    </div>
  );
}

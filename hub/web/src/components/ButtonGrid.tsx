import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ButtonConfig } from "../lib/api";
import type { BrowserDropData } from "./PluginBrowser";

interface ButtonGridProps {
  buttons: ButtonConfig[];
  columns: number;
  rows: number;
  selectedPos: [number, number] | null;
  onSelect(pos: [number, number]): void;
  onDrop?(pos: [number, number], data: BrowserDropData): void;
  previews?: Record<string, string>;
}

export default function ButtonGrid({
  buttons,
  columns,
  rows,
  selectedPos,
  onSelect,
  onDrop,
  previews = {},
}: ButtonGridProps) {
  const [dragOverPos, setDragOverPos] = useState<string | null>(null);

  const buttonMap = new Map<string, ButtonConfig>();
  for (const btn of buttons) {
    buttonMap.set(`${btn.pos[0]},${btn.pos[1]}`, btn);
  }

  function handleDragOver(e: React.DragEvent, key: string) {
    if (e.dataTransfer.types.includes("application/omnideck-browser")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOverPos(key);
    }
  }

  function handleDragLeave() {
    setDragOverPos(null);
  }

  function handleDrop(e: React.DragEvent, col: number, row: number) {
    e.preventDefault();
    setDragOverPos(null);
    const raw = e.dataTransfer.getData("application/omnideck-browser");
    if (!raw || !onDrop) return;
    try {
      const data = JSON.parse(raw) as BrowserDropData;
      onDrop([col, row], data);
    } catch {
      // ignore malformed data
    }
  }

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {Array.from({ length: rows * columns }, (_, i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        const key = `${col},${row}`;
        const btn = buttonMap.get(key);
        const isSelected =
          selectedPos?.[0] === col && selectedPos?.[1] === row;
        const isDragOver = dragOverPos === key;

        return (
          <button
            key={key}
            onClick={() => onSelect([col, row])}
            onDragOver={(e) => handleDragOver(e, key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col, row)}
            className={cn(
              "aspect-square rounded border-2 flex flex-col items-center justify-center p-1 text-xs transition-all",
              isSelected
                ? "border-primary bg-primary/10"
                : btn
                  ? "border-border bg-muted hover:border-primary/50"
                  : "border-dashed border-border hover:border-primary/50 bg-background",
              isDragOver && "border-primary bg-primary/20 scale-105",
            )}
          >
            {(() => {
              const previewUrl = previews[key];
              if (previewUrl) {
                return (
                  <img
                    src={previewUrl}
                    alt={btn?.label ?? key}
                    className="w-full h-full object-cover rounded"
                    draggable={false}
                  />
                );
              }
              if (btn) {
                return (
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
                      {btn.label ?? btn.preset ?? key}
                    </span>
                  </>
                );
              }
              return <Plus className="w-4 h-4 text-muted-foreground/40" />;
            })()}
          </button>
        );
      })}
    </div>
  );
}

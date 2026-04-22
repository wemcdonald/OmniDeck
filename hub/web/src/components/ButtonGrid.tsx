import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ButtonConfig, DisplayAreaInfo } from "../lib/api";
import type { BrowserDropData } from "./PluginBrowser";

interface ButtonGridProps {
  buttons: ButtonConfig[];
  columns: number;
  rows: number;
  selectedPos: [number, number] | null;
  onSelect(pos: [number, number]): void;
  onDrop?(pos: [number, number], data: BrowserDropData): void;
  previews?: Record<string, string>;
  previewsLoading?: boolean;
  displayAreas?: DisplayAreaInfo[];
  displayAreaPreviews?: Record<string, string>;
  keySize?: { width: number; height: number };
}

export default function ButtonGrid({
  buttons,
  columns,
  rows,
  selectedPos,
  onSelect,
  onDrop,
  previews = {},
  previewsLoading = false,
  displayAreas = [],
  displayAreaPreviews = {},
  keySize = { width: 1, height: 1 },
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

  // Main grid and each display area share horizontal space proportional to
  // real hardware pixel widths. With mirabox (95-wide keys, 82-wide strip)
  // this makes the strip column visibly narrower than a key column.
  const mainFlex = columns * keySize.width;

  return (
    <div className="flex gap-2 items-stretch">
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, flex: `${mainFlex} 0 0` }}
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
            style={{ aspectRatio: `${keySize.width} / ${keySize.height}` }}
            className={cn(
              "rounded border-2 flex flex-col items-center justify-center p-1 text-xs transition-all min-h-[44px]",
              isSelected
                ? "border-primary bg-primary/10 dark:glow-primary"
                : btn
                  ? "border-outline-variant dark:border-outline bg-surface-container hover:border-primary/60"
                  : "border-dashed border-outline-variant dark:border-outline hover:border-primary/60 bg-background",
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
              if (btn && previewsLoading) {
                return <div className="w-full h-full rounded bg-muted-foreground/10 animate-pulse" />;
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
                    <span className="truncate w-full text-center leading-tight font-medium font-mono text-[10px]">
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

    {/* Display area columns (e.g. Mirabox side strip) — rendered at real
        aspect ratio so a user can see that the side display is not a normal
        key column. Dashed border marks it as non-button space; the "STRIP"
        label floats over the top border (fieldset-legend style) so it
        doesn't push the first cell down out of alignment with the main
        grid. */}
    {displayAreas.map((area) => {
      return (
        <div
          key={area.id}
          className="relative flex flex-col rounded border border-dashed border-outline-variant/70 dark:border-outline/70 bg-surface-container-low/40 gap-2"
          style={{ flex: `${area.pixelWidth} 0 0` }}
          title={`Display strip (${area.pixelWidth}×${area.pixelHeight}px, ${area.rows} segments)`}
        >
          <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 text-[9px] font-display font-semibold uppercase tracking-wider text-muted-foreground bg-background leading-none">
            Strip
          </span>
          <div className="flex flex-col gap-2 flex-1">
            {Array.from({ length: area.rows }, (_, row) => {
              const pos: [number, number] = [area.col, row];
              const key = `${area.col},${row}`;
              const btn = buttonMap.get(key);
              const isSelected = selectedPos?.[0] === area.col && selectedPos?.[1] === row;
              const previewUrl = displayAreaPreviews[`${area.id}:${row}`];
              return (
                <button
                  key={row}
                  onClick={() => onSelect(pos)}
                  onDragOver={(e) => handleDragOver(e, key)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, area.col, row)}
                  className={cn(
                    "flex-1 min-h-0 rounded border-2 flex flex-col items-center justify-center p-1 text-xs transition-all",
                    isSelected
                      ? "border-primary bg-primary/10 dark:glow-primary"
                      : btn
                        ? "border-outline-variant dark:border-outline bg-surface-container hover:border-primary/60"
                        : "border-dashed border-outline-variant/50 dark:border-outline/50 hover:border-primary/60 bg-background/50",
                    dragOverPos === key && "border-primary bg-primary/20 scale-105",
                  )}
                >
                  {previewUrl ? (
                    <img src={previewUrl} alt={key} className="w-full h-full object-cover rounded" draggable={false} />
                  ) : btn && previewsLoading ? (
                    <div className="w-full h-full rounded bg-muted-foreground/10 animate-pulse" />
                  ) : btn ? (
                    <span className="truncate w-full text-center text-[10px] font-mono">{btn.label ?? btn.preset ?? key}</span>
                  ) : (
                    <Plus className="w-3 h-3 text-muted-foreground/30" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      );
    })}
    </div>
  );
}

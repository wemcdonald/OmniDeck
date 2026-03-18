import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@iconify/react";
import icons from "@iconify-json/material-symbols/icons.json";

const ALL_ICONS: string[] = Object.keys((icons as { icons: Record<string, unknown> }).icons);

interface Props {
  value?: string;
  onSelect(icon: string): void;
}

export default function MaterialSymbolsPicker({ value, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.right - 320 });
    }
    setOpen((o) => !o);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q ? ALL_ICONS.filter((n) => n.includes(q)) : ALL_ICONS;
    return list.slice(0, 200);
  }, [search]);

  const currentIconName = value?.startsWith("ms:") ? value.slice(3) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="w-9 h-9 flex items-center justify-center rounded border hover:border-primary transition-colors shrink-0"
        title="Pick Material Symbol"
      >
        {currentIconName ? (
          <Icon icon={`material-symbols:${currentIconName}`} width={20} height={20} />
        ) : (
          <Icon icon="material-symbols:grid-view" width={20} height={20} />
        )}
      </button>
      {open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-80 bg-background border rounded-lg shadow-xl flex flex-col"
        >
          <div className="p-2 border-b">
            <input
              autoFocus
              type="text"
              placeholder="Search icons…"
              className="w-full rounded border px-2 py-1 text-sm bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-8 gap-0.5 p-2 overflow-y-auto max-h-72">
            {filtered.map((name) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => { onSelect(`ms:${name}`); setOpen(false); }}
                className={`p-1 rounded hover:bg-muted flex items-center justify-center transition-colors ${
                  currentIconName === name ? "bg-primary/20 ring-1 ring-primary" : ""
                }`}
              >
                <Icon icon={`material-symbols:${name}`} width={20} height={20} />
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center p-4">No icons found</p>
          )}
          {!search && (
            <p className="text-xs text-muted-foreground text-center pb-2">
              Showing 200 of {ALL_ICONS.length} — search to filter
            </p>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

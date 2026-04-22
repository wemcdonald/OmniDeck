import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@iconify/react";
import type { PluginCatalog } from "../lib/api";

interface Props {
  value?: string;
  catalog: PluginCatalog;
  onSelect(icon: string): void;
}

export default function PluginIconsPicker({ value, catalog, onSelect }: Props) {
  const [open, setOpen] = useState(false);
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

  const pluginsWithIcons = catalog.plugins.filter((p) => p.icons && p.icons.length > 0);

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.right - 320 });
    }
    setOpen((o) => !o);
  }

  const currentIsPlugin = value?.startsWith("plugin:");

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        disabled={pluginsWithIcons.length === 0}
        className="w-9 h-9 flex items-center justify-center rounded border hover:border-primary transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        title={pluginsWithIcons.length === 0 ? "No plugin icons registered" : "Pick plugin icon"}
      >
        {currentIsPlugin ? (
          <img
            src={`/api/plugin-icons/${value!.slice("plugin:".length).replace("/", "/")}`}
            alt=""
            className="w-5 h-5 object-contain"
          />
        ) : (
          <Icon icon="material-symbols:extension" width={20} height={20} />
        )}
      </button>
      {open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-80 bg-background border rounded-lg shadow-xl flex flex-col max-h-96 overflow-y-auto"
        >
          {pluginsWithIcons.map((plugin) => (
            <div key={plugin.id} className="border-b last:border-b-0">
              <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/30">
                {plugin.name}
              </div>
              <div className="grid grid-cols-6 gap-0.5 p-2">
                {plugin.icons.map((ico) => (
                  <button
                    key={ico.name}
                    type="button"
                    title={`${ico.ref} (${ico.name})`}
                    onClick={() => { onSelect(ico.ref); setOpen(false); }}
                    className={`p-1 rounded hover:bg-muted flex items-center justify-center transition-colors ${
                      value === ico.ref ? "bg-primary/20 ring-1 ring-primary" : ""
                    }`}
                  >
                    <img
                      src={ico.url}
                      alt={ico.name}
                      className="w-6 h-6 object-contain"
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

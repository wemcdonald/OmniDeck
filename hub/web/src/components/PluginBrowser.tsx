import { useState, useMemo } from "react";
import { Icon } from "@iconify/react";
import { ChevronRight, AlertTriangle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PluginCatalog,
  PluginCatalogEntry,
} from "../lib/api";

/** What kind of item is being dragged / clicked. */
export interface BrowserDropData {
  type: "preset" | "action" | "stateProvider";
  qualifiedId: string;
}

interface PluginBrowserProps {
  catalog: PluginCatalog;
  /** Called when a user clicks an item (touch-friendly alternative to drag). */
  onItemClick?: (item: BrowserDropData) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function msIcon(name?: string) {
  if (!name) return null;
  if (name.startsWith("ms:")) {
    return (
      <Icon
        icon={`material-symbols:${name.slice(3)}`}
        className="w-4 h-4 shrink-0"
      />
    );
  }
  return <span className="text-sm shrink-0">{name}</span>;
}

function setDragData(e: React.DragEvent, data: BrowserDropData) {
  e.dataTransfer.setData("application/omnideck-browser", JSON.stringify(data));
  e.dataTransfer.effectAllowed = "copy";
}

// ── Browser Item ────────────────────────────────────────────────────────────

function BrowserItem({
  icon,
  name,
  description,
  badge,
  data,
  dimmed,
  onItemClick,
}: {
  icon?: string;
  name: string;
  description?: string;
  badge?: string;
  data: BrowserDropData;
  dimmed?: boolean;
  onItemClick?: (item: BrowserDropData) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => setDragData(e, data)}
      onClick={() => onItemClick?.(data)}
      title={description}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-grab active:cursor-grabbing",
        "hover:bg-accent/50 transition-colors select-none",
        dimmed && "opacity-40 pointer-events-none",
      )}
    >
      <span className="shrink-0 text-muted-foreground">{msIcon(icon)}</span>
      <span className="truncate flex-1">{name}</span>
      {badge && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
          {badge}
        </span>
      )}
    </div>
  );
}

// ── Section (Presets / Actions / State Providers) ───────────────────────────

function Section({
  label,
  children,
  defaultOpen = true,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1 w-full hover:text-foreground transition-colors"
      >
        <ChevronRight
          className={cn("w-3 h-3 transition-transform", open && "rotate-90")}
        />
        {label}
      </button>
      {open && <div className="ml-1">{children}</div>}
    </div>
  );
}

// ── Plugin Group ────────────────────────────────────────────────────────────

function PluginGroup({
  plugin,
  search,
  onItemClick,
}: {
  plugin: PluginCatalogEntry;
  search: string;
  onItemClick?: (item: BrowserDropData) => void;
}) {
  const [open, setOpen] = useState(true);
  const isMisconfigured =
    plugin.health.status === "misconfigured" || plugin.health.status === "error";

  // Filter items by search
  const q = search.toLowerCase();
  const presets = q
    ? plugin.presets.filter(
        (p) => p.name.toLowerCase().includes(q) || p.qualifiedId.includes(q),
      )
    : plugin.presets;
  const actions = q
    ? plugin.actions.filter(
        (a) => a.name.toLowerCase().includes(q) || a.qualifiedId.includes(q),
      )
    : plugin.actions;
  const providers = q
    ? plugin.stateProviders.filter(
        (s) => s.name.toLowerCase().includes(q) || s.qualifiedId.includes(q),
      )
    : plugin.stateProviders;

  // Hide plugin entirely if nothing matches search
  if (q && presets.length === 0 && actions.length === 0 && providers.length === 0) {
    return null;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 w-full text-sm font-medium hover:bg-accent/30 rounded transition-colors"
      >
        <ChevronRight
          className={cn("w-3.5 h-3.5 transition-transform text-muted-foreground", open && "rotate-90")}
        />
        <span className="shrink-0">{msIcon(plugin.icon)}</span>
        <span className="flex-1 text-left truncate">{plugin.name}</span>
        {isMisconfigured && (
          <span title={plugin.health.message ?? "Plugin misconfigured"}>
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
          </span>
        )}
      </button>

      {open && (
        <div className="ml-3 space-y-1">
          {presets.length > 0 && (
            <Section label="Presets">
              {presets.map((p) => (
                <BrowserItem
                  key={p.qualifiedId}
                  icon={p.icon}
                  name={p.name}
                  description={p.description}
                  data={{ type: "preset", qualifiedId: p.qualifiedId }}
                  dimmed={isMisconfigured}
                  onItemClick={onItemClick}
                />
              ))}
            </Section>
          )}
          {actions.length > 0 && (
            <Section label="Actions" defaultOpen={!q && presets.length > 0 ? false : true}>
              {actions.map((a) => (
                <BrowserItem
                  key={a.qualifiedId}
                  icon={a.icon}
                  name={a.name}
                  description={a.description}
                  data={{ type: "action", qualifiedId: a.qualifiedId }}
                  dimmed={isMisconfigured}
                  onItemClick={onItemClick}
                />
              ))}
            </Section>
          )}
          {providers.length > 0 && (
            <Section label="State Providers" defaultOpen={false}>
              {providers.map((s) => (
                <BrowserItem
                  key={s.qualifiedId}
                  icon={s.icon}
                  name={s.name}
                  description={s.description}
                  badge={s.providesIcon ? "icon" : undefined}
                  data={{ type: "stateProvider", qualifiedId: s.qualifiedId }}
                  dimmed={isMisconfigured}
                  onItemClick={onItemClick}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Browser ────────────────────────────────────────────────────────────

export default function PluginBrowser({ catalog, onItemClick }: PluginBrowserProps) {
  const [search, setSearch] = useState("");

  const sortedPlugins = useMemo(
    () =>
      [...catalog.plugins].sort((a, b) => {
        // Core first, then alphabetical
        if (a.id === "omnideck-core") return -1;
        if (b.id === "omnideck-core") return 1;
        return a.name.localeCompare(b.name);
      }),
    [catalog],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-2 pb-2 pt-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search…"
            className="w-full rounded border bg-background pl-7 pr-2 py-1.5 text-sm placeholder:text-muted-foreground"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-1 space-y-0.5">
        {sortedPlugins.map((plugin) => (
          <PluginGroup
            key={plugin.id}
            plugin={plugin}
            search={search}
            onItemClick={onItemClick}
          />
        ))}
      </div>
    </div>
  );
}

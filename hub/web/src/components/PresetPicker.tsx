import { useState, useEffect, useMemo } from "react";
import { Icon } from "@iconify/react";
import { api, type PresetInfo } from "../lib/api.ts";

interface Props {
  selected: string;
  onSelect(qualifiedId: string, preset: PresetInfo): void;
}

export default function PresetPicker({ selected, onSelect }: Props) {
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.status.presets().then(setPresets).catch(console.error);
  }, []);

  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? presets.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.qualifiedId.toLowerCase().includes(q),
        )
      : presets;
    const groups = new Map<string, PresetInfo[]>();
    for (const p of filtered) {
      const list = groups.get(p.pluginId) ?? [];
      list.push(p);
      groups.set(p.pluginId, list);
    }
    return groups;
  }, [presets, search]);

  function renderIcon(icon?: string) {
    if (!icon) return null;
    if (icon.startsWith("ms:")) {
      return <Icon icon={`material-symbols:${icon.slice(3)}`} width={24} height={24} />;
    }
    return <span className="text-lg">{icon}</span>;
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Search presets…"
        className="w-full rounded border px-2 py-1 text-sm bg-background"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-64 overflow-y-auto space-y-3">
        {presets.length === 0 && (
          <p className="text-xs text-muted-foreground">No presets available</p>
        )}
        {Array.from(grouped.entries()).map(([pluginId, items]) => (
          <div key={pluginId}>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              {pluginId}
            </h4>
            <div className="grid grid-cols-2 gap-1">
              {items.map((p) => (
                <button
                  key={p.qualifiedId}
                  type="button"
                  onClick={() => onSelect(p.qualifiedId, p)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors ${
                    selected === p.qualifiedId
                      ? "bg-primary/20 ring-1 ring-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  <span className="shrink-0">{renderIcon(p.defaults.icon)}</span>
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {grouped.size === 0 && presets.length > 0 && (
          <p className="text-xs text-muted-foreground">No presets match your search</p>
        )}
      </div>
    </div>
  );
}

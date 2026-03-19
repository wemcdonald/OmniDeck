import { useState, useEffect, useRef } from "react";

interface HaEntity {
  entity_id: string;
  name: string;
  domain: string;
  state: string;
}

interface EntityPickerProps {
  value: string;
  onChange(entityId: string): void;
  domain?: string;
  placeholder?: string;
}

export default function EntityPicker({
  value,
  onChange,
  domain,
  placeholder = "Select entity…",
}: EntityPickerProps) {
  const [entities, setEntities] = useState<HaEntity[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch entities on mount / domain change
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (domain) params.set("domain", domain);
    fetch(`/api/ha/entities?${params}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setEntities(data as HaEntity[]))
      .catch(() => setEntities([]))
      .finally(() => setLoading(false));
  }, [domain]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = search
    ? entities.filter(
        (e) =>
          e.entity_id.toLowerCase().includes(search.toLowerCase()) ||
          e.name.toLowerCase().includes(search.toLowerCase()),
      )
    : entities;

  const selectedEntity = entities.find((e) => e.entity_id === value);

  return (
    <div ref={ref} className="relative">
      {/* Display / trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full rounded border px-2 py-1.5 text-sm bg-background text-left flex items-center justify-between hover:border-primary/50 transition-colors"
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {selectedEntity
            ? `${selectedEntity.name} (${selectedEntity.entity_id})`
            : value || placeholder}
        </span>
        <span className="text-muted-foreground text-xs ml-2">
          {selectedEntity ? selectedEntity.state : ""}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-hidden flex flex-col">
          <div className="p-1.5 border-b">
            <input
              type="text"
              autoFocus
              placeholder="Search entities…"
              className="w-full rounded border px-2 py-1 text-sm bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {loading && (
              <p className="text-xs text-muted-foreground p-2">Loading…</p>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-xs text-muted-foreground p-2">
                {entities.length === 0 ? "No entities available" : "No matches"}
              </p>
            )}
            {filtered.slice(0, 100).map((e) => (
              <button
                key={e.entity_id}
                type="button"
                onClick={() => {
                  onChange(e.entity_id);
                  setOpen(false);
                  setSearch("");
                }}
                className={`w-full text-left px-2 py-1.5 text-sm hover:bg-accent/50 flex items-center justify-between ${
                  e.entity_id === value ? "bg-accent" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{e.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{e.entity_id}</div>
                </div>
                <span className="text-xs text-muted-foreground ml-2 shrink-0">
                  {e.state}
                </span>
              </button>
            ))}
          </div>
          {/* Fallback: manual text input */}
          <div className="border-t p-1.5">
            <input
              type="text"
              placeholder="Or type entity_id manually…"
              className="w-full rounded border px-2 py-1 text-xs bg-background"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.currentTarget.value) {
                  onChange(e.currentTarget.value);
                  setOpen(false);
                  setSearch("");
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

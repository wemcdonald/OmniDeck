import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "../lib/api.ts";
import { ChevronDown, ChevronUp, Download } from "lucide-react";

interface PluginDownload {
  name: string;
  label: string;
  path: string;
  description?: string;
}

interface CatalogField {
  key: string;
  label?: string;
  required?: boolean;
  fieldType?: string;
  zodType?: string;
  placeholder?: string;
}

interface PluginConfigCardProps {
  id: string;
  name?: string;
  version?: string;
  icon?: string;
  health?: { status: string; message?: string };
  downloads?: PluginDownload[];
  config: Record<string, unknown>;
  configFields?: CatalogField[];
  onSaved(): void;
}

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes("token") || lower.includes("secret") || lower.includes("password");
}

function healthBadge(health?: { status: string }) {
  const status = health?.status ?? "ok";
  switch (status) {
    case "ok": return <Badge variant="success">running</Badge>;
    case "misconfigured": return <Badge variant="warning">misconfigured</Badge>;
    case "error": return <Badge variant="destructive">error</Badge>;
    case "degraded": return <Badge variant="warning">degraded</Badge>;
    default: return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function PluginConfigCard({ id, name, version, icon: _icon, health, downloads, config, configFields, onSaved }: PluginConfigCardProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...config });
  const [showYaml, setShowYaml] = useState(false);

  // Sync draft when config prop changes (query may resolve after initial render)
  useEffect(() => {
    if (Object.keys(config).length > 0) {
      setDraft({ ...config });
    }
  }, [JSON.stringify(config)]);

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.plugins.save(id, data),
    onSuccess: () => onSaved(),
    onError: (e) => alert(`Save failed: ${e}`),
  });

  function setField(key: string, value: unknown) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Card className="bg-surface-container rounded border border-outline-variant">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{name ?? id}</CardTitle>
          <div className="flex items-center gap-2">
            {version && <span className="text-xs text-muted-foreground">v{version}</span>}
            {healthBadge(health)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {(() => {
          // Build ordered field list: schema fields first, then any extra stored keys
          const schemaKeys = new Set(configFields?.map(f => f.key) ?? []);
          const extraKeys = Object.keys(draft).filter(k => !schemaKeys.has(k));
          const allFields = [
            ...(configFields ?? []).map(f => ({
              key: f.key,
              label: f.label ?? f.key,
              fieldType: f.fieldType,
              placeholder: f.placeholder,
              fromSchema: true,
            })),
            ...extraKeys.map(k => ({
              key: k,
              label: k,
              fieldType: undefined as string | undefined,
              placeholder: undefined as string | undefined,
              fromSchema: false,
            })),
          ];

          if (allFields.length === 0) {
            return <p className="text-xs text-muted-foreground">No configuration options</p>;
          }

          return (
            <>
              {allFields.map((field) => {
                const value = draft[field.key];
                return (
                  <div key={field.key}>
                    <label className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                      {field.label}
                    </label>
                    {field.fieldType === "color" ? (
                      <input
                        type="color"
                        className="h-8 w-16 rounded bg-surface-container-high border border-outline-variant px-1 py-0.5"
                        value={String(value ?? "#000000")}
                        onChange={(e) => setField(field.key, e.target.value)}
                      />
                    ) : isSecretKey(field.key) ? (
                      <input
                        type="password"
                        className="w-full rounded bg-surface-container-high border border-outline-variant px-2 py-1 text-sm"
                        value={String(value ?? "")}
                        placeholder={field.placeholder}
                        onChange={(e) => setField(field.key, e.target.value)}
                      />
                    ) : typeof value === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={(e) => setField(field.key, e.target.checked)}
                        className="h-4 w-4 rounded bg-surface-container-high border border-outline-variant"
                      />
                    ) : typeof value === "number" ? (
                      <input
                        type="number"
                        className="w-full rounded bg-surface-container-high border border-outline-variant px-2 py-1 text-sm"
                        value={value}
                        placeholder={field.placeholder}
                        onChange={(e) => setField(field.key, parseFloat(e.target.value))}
                      />
                    ) : (
                      <input
                        type="text"
                        className="w-full rounded bg-surface-container-high border border-outline-variant px-2 py-1 text-sm"
                        value={String(value ?? "")}
                        placeholder={field.placeholder}
                        onChange={(e) => setField(field.key, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => saveMutation.mutate(draft)}
                  disabled={saveMutation.isPending}
                  className="rounded bg-primary text-primary-foreground px-3 py-1 text-sm font-medium disabled:opacity-50"
                >
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setShowYaml((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {showYaml ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  View YAML
                </button>
              </div>
            </>
          );
        })()}

        {downloads && downloads.length > 0 && (
          <div className="space-y-2 pt-1">
            {downloads.map((dl) => (
              <div key={dl.name}>
                <a
                  href={`/api/plugins/${id}/download/${dl.name}`}
                  className="inline-flex items-center gap-1.5 rounded bg-surface-container-high border border-outline-variant px-3 py-1.5 text-sm font-medium hover:bg-surface-container-highest transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  {dl.label}
                </a>
                {dl.description && (
                  <p className="text-xs text-muted-foreground mt-1">{dl.description}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {showYaml && (
          <pre className="text-xs font-mono bg-surface-container rounded border border-outline-variant p-2 overflow-x-auto">
            {JSON.stringify(draft, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

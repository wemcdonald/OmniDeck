import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { stringify as toYaml } from "yaml";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, type CatalogField } from "../lib/api.ts";
import ParamField from "./ParamField.tsx";
import { ChevronDown, ChevronUp, Download } from "lucide-react";

interface PluginDownload {
  name: string;
  label: string;
  path: string;
  description?: string;
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
  /** Keys stored as !secret references — show masked and don't overwrite if blank on save */
  secretFields?: string[];
  /** When true, renders without the Card wrapper (used inside PluginRow) */
  embedded?: boolean;
  onSaved(): void;
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

export default function PluginConfigCard({ id, name, version, icon: _icon, health, downloads, config, configFields, secretFields = [], embedded = false, onSaved }: PluginConfigCardProps) {
  const secretFieldSet = new Set(secretFields);
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...config });
  const [showYaml, setShowYaml] = useState(false);
  const [editingSecrets, setEditingSecrets] = useState<Set<string>>(new Set());

  // Sync draft when config prop changes (query may resolve after initial render)
  useEffect(() => {
    if (Object.keys(config).length > 0) {
      setDraft({ ...config });
    }
  }, [JSON.stringify(config)]);

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => {
      // Strip secret fields that are empty (user left them blank = keep existing !secret)
      const filtered: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        if (secretFieldSet.has(k) && (v === "" || v === null || v === undefined)) continue;
        filtered[k] = v;
      }
      return api.plugins.save(id, filtered);
    },
    onSuccess: () => onSaved(),
    onError: (e) => alert(`Save failed: ${e}`),
  });

  function setField(key: string, value: unknown) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function startEditingSecret(key: string) {
    setEditingSecrets((prev) => new Set([...prev, key]));
    setDraft((prev) => ({ ...prev, [key]: "" }));
  }

  const formContent = (
    <div className="space-y-3">
      {(() => {
          // Build ordered field list: schema fields first, then any extra stored keys
          const schemaKeys = new Set(configFields?.map(f => f.key) ?? []);
          const extraKeys = Object.keys(draft).filter(k => !schemaKeys.has(k));
          type Row = { field: CatalogField; fromSchema: boolean };
          const allRows: Row[] = [
            ...(configFields ?? []).map((f): Row => ({ field: f, fromSchema: true })),
            ...extraKeys.map((k): Row => ({
              field: {
                key: k,
                zodType: typeof draft[k] === "number" ? "number"
                  : typeof draft[k] === "boolean" ? "boolean"
                  : "string",
                required: false,
                label: k,
              },
              fromSchema: false,
            })),
          ];

          if (allRows.length === 0) {
            return <p className="text-xs text-muted-foreground">No configuration options</p>;
          }

          return (
            <>
              {allRows.map(({ field: f }) => {
                const value = draft[f.key];
                const isSecret = f.secret === true || secretFieldSet.has(f.key);
                const isEditing = editingSecrets.has(f.key);
                const showMaskedStub = isSecret && secretFieldSet.has(f.key) && !isEditing;

                return (
                  <div key={f.key}>
                    {/* Secret fields keep the uppercase label + (secret) tag + masked stub UI.
                        Everything else delegates to ParamField (duration/radio/slider/etc.). */}
                    {isSecret ? (
                      <>
                        <label className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                          {f.label ?? f.key}
                          <span className="ml-1.5 text-xs normal-case tracking-normal font-normal text-muted-foreground">(secret)</span>
                        </label>
                        {showMaskedStub ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground tracking-widest">••••••••</span>
                            <button
                              type="button"
                              onClick={() => startEditingSecret(f.key)}
                              className="text-xs text-primary hover:underline"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <input
                            type="password"
                            className="w-full rounded bg-surface-container-high border border-outline-variant px-2 py-1 text-sm"
                            value={String(value ?? "")}
                            placeholder={f.placeholder ?? "Enter value"}
                            onChange={(e) => setField(f.key, e.target.value)}
                          />
                        )}
                      </>
                    ) : (
                      <ParamField
                        field={f}
                        value={value}
                        onChange={(v) => setField(f.key, v)}
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
            {`${id}:\n`}{toYaml(draft, { indent: 2 }).trimEnd().split("\n").map(l => `  ${l}`).join("\n")}
          </pre>
        )}
    </div>
  );

  if (embedded) return formContent;

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
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}

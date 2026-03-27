import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "../lib/api.ts";
import { ChevronDown, ChevronUp } from "lucide-react";

interface PluginConfigCardProps {
  id: string;
  config: Record<string, unknown>;
  onSaved(): void;
}

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes("token") || lower.includes("secret") || lower.includes("password");
}

export default function PluginConfigCard({ id, config, onSaved }: PluginConfigCardProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...config });
  const [saving, setSaving] = useState(false);
  const [showYaml, setShowYaml] = useState(false);

  function setField(key: string, value: unknown) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      await api.plugins.save(id, draft);
      onSaved();
    } catch (e) {
      alert(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="bg-surface-container rounded border border-outline-variant">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{id}</CardTitle>
          <Badge variant="success">configured</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(draft).length === 0 ? (
          <p className="text-xs text-muted-foreground">No configuration options</p>
        ) : (
          <>
            {Object.entries(draft).map(([key, value]) => (
              <div key={key}>
                <label className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                  {key}
                </label>
                {typeof value === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setField(key, e.target.checked)}
                    className="h-4 w-4 rounded bg-surface-container-high border border-outline-variant"
                  />
                ) : typeof value === "number" ? (
                  <input
                    type="number"
                    className="w-full rounded bg-surface-container-high border border-outline-variant px-2 py-1 text-sm"
                    value={value}
                    onChange={(e) => setField(key, parseFloat(e.target.value))}
                  />
                ) : (
                  <input
                    type={isSecretKey(key) ? "password" : "text"}
                    className="w-full rounded bg-surface-container-high border border-outline-variant px-2 py-1 text-sm"
                    value={String(value ?? "")}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                )}
              </div>
            ))}

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={save}
                disabled={saving}
                className="rounded bg-primary text-primary-foreground px-3 py-1 text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
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

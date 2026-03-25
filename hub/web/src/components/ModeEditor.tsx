import { useState } from "react";
import type { ModeConfig, ModeRule, ModeCheck, ModeAction } from "../lib/api.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  ArrowLeft,
  Plus,
  Trash2,
  X,
} from "lucide-react";

const COMPARATORS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "in", label: "is one of" },
  { value: "not_in", label: "is not one of" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "contains", label: "contains" },
  { value: "matches", label: "matches (regex)" },
] as const;

type ComparatorKey = (typeof COMPARATORS)[number]["value"];

function getComparator(check: ModeCheck): ComparatorKey {
  for (const c of COMPARATORS) {
    if (check[c.value] !== undefined) return c.value;
  }
  return "equals";
}

function getComparatorValue(check: ModeCheck): string {
  const key = getComparator(check);
  const val = check[key];
  if (Array.isArray(val)) return val.join(", ");
  return String(val ?? "");
}

function emptyCheck(): ModeCheck {
  return { provider: "", attribute: "", equals: "" };
}

function emptyRule(): ModeRule {
  return { condition: "and", checks: [emptyCheck()] };
}

interface Props {
  id: string;
  config: ModeConfig | undefined;
  onSave: (id: string, config: ModeConfig) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}

export default function ModeEditor({ id: initialId, config, onSave, onCancel, onDelete }: Props) {
  const isNew = !config;
  const [modeId, setModeId] = useState(initialId);
  const [name, setName] = useState(config?.name ?? "");
  const [icon, setIcon] = useState(config?.icon ?? "");
  const [priority, setPriority] = useState(config?.priority ?? 50);
  const [rules, setRules] = useState<ModeRule[]>(config?.rules ?? [emptyRule()]);
  const [onEnter, setOnEnter] = useState<ModeAction[]>(config?.on_enter ?? []);
  const [onExit, setOnExit] = useState<ModeAction[]>(config?.on_exit ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!modeId.trim()) {
      setError("Mode ID is required");
      return;
    }
    if (!name.trim()) {
      setError("Mode name is required");
      return;
    }
    // Filter out empty rules/checks
    const cleanRules = rules
      .map((r) => ({
        ...r,
        checks: r.checks.filter((c) => c.provider && c.attribute),
      }))
      .filter((r) => r.checks.length > 0);

    if (cleanRules.length === 0) {
      setError("At least one rule with checks is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(modeId.trim(), {
        name: name.trim(),
        icon: icon.trim() || undefined,
        priority,
        rules: cleanRules,
        on_enter: onEnter.filter((a) => a.switch_page || a.trigger_action),
        on_exit: onExit.filter((a) => a.switch_page || a.trigger_action),
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function updateRule(ruleIdx: number, update: Partial<ModeRule>) {
    setRules((prev) => prev.map((r, i) => (i === ruleIdx ? { ...r, ...update } : r)));
  }

  function updateCheck(ruleIdx: number, checkIdx: number, update: Partial<ModeCheck>) {
    setRules((prev) =>
      prev.map((r, ri) =>
        ri === ruleIdx
          ? { ...r, checks: r.checks.map((c, ci) => (ci === checkIdx ? { ...c, ...update } : c)) }
          : r
      )
    );
  }

  function setCheckComparator(ruleIdx: number, checkIdx: number, comparator: ComparatorKey, value: string) {
    setRules((prev) =>
      prev.map((r, ri) =>
        ri === ruleIdx
          ? {
              ...r,
              checks: r.checks.map((c, ci) => {
                if (ci !== checkIdx) return c;
                // Clear all comparators, set the new one
                const clean: ModeCheck = { provider: c.provider, attribute: c.attribute, params: c.params, target: c.target };
                if (comparator === "in" || comparator === "not_in") {
                  clean[comparator] = value.split(",").map((v) => v.trim()).filter(Boolean);
                } else if (comparator === "greater_than" || comparator === "less_than") {
                  clean[comparator] = Number(value) || 0;
                } else if (comparator === "equals" || comparator === "not_equals") {
                  clean[comparator] = value;
                } else if (comparator === "contains") {
                  clean.contains = value;
                } else if (comparator === "matches") {
                  clean.matches = value;
                }
                return clean;
              }),
            }
          : r
      )
    );
  }

  function removeCheck(ruleIdx: number, checkIdx: number) {
    setRules((prev) =>
      prev.map((r, ri) =>
        ri === ruleIdx ? { ...r, checks: r.checks.filter((_, ci) => ci !== checkIdx) } : r
      )
    );
  }

  function addCheck(ruleIdx: number) {
    setRules((prev) =>
      prev.map((r, ri) =>
        ri === ruleIdx ? { ...r, checks: [...r.checks, emptyCheck()] } : r
      )
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-8 w-8 p-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">{isNew ? "New Mode" : `Edit: ${name}`}</h2>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Basic info */}
      <Card size="sm">
        <CardHeader>
          <CardTitle>Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isNew && (
            <div className="grid grid-cols-[120px_1fr] items-center gap-2">
              <label className="text-sm text-muted-foreground">ID</label>
              <input
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
                placeholder="gaming"
                value={modeId}
                onChange={(e) => setModeId(e.target.value.replace(/[^a-z0-9_-]/g, ""))}
              />
            </div>
          )}
          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <label className="text-sm text-muted-foreground">Name</label>
            <input
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
              placeholder="Gaming"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <label className="text-sm text-muted-foreground">Icon</label>
            <input
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
              placeholder="ms:sports_esports"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <label className="text-sm text-muted-foreground">Priority</label>
            <input
              type="number"
              className="rounded-md border bg-background px-3 py-1.5 text-sm w-24"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 50)}
            />
            <span className="col-start-2 text-xs text-muted-foreground">Lower = higher priority</span>
          </div>
        </CardContent>
      </Card>

      {/* Rules */}
      <Card size="sm">
        <CardHeader>
          <CardTitle>Rules</CardTitle>
          <p className="text-xs text-muted-foreground">Any rule matching activates this mode (top-level OR).</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {rules.map((rule, ruleIdx) => (
            <div key={ruleIdx} className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rule {ruleIdx + 1}:</span>
                  <select
                    className="rounded border bg-background px-2 py-1 text-xs"
                    value={rule.condition}
                    onChange={(e) => updateRule(ruleIdx, { condition: e.target.value as "and" | "or" })}
                  >
                    <option value="and">Match ALL checks</option>
                    <option value="or">Match ANY check</option>
                  </select>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground"
                  onClick={() => setRules((prev) => prev.filter((_, i) => i !== ruleIdx))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              {rule.checks.map((check, checkIdx) => (
                <div key={checkIdx} className="flex flex-wrap items-center gap-2 pl-2">
                  <input
                    className="rounded border bg-background px-2 py-1 text-xs w-48"
                    placeholder="provider (e.g. os-control.active_window)"
                    value={check.provider}
                    onChange={(e) => updateCheck(ruleIdx, checkIdx, { provider: e.target.value })}
                  />
                  <input
                    className="rounded border bg-background px-2 py-1 text-xs w-28"
                    placeholder="attribute"
                    value={check.attribute}
                    onChange={(e) => updateCheck(ruleIdx, checkIdx, { attribute: e.target.value })}
                  />
                  <select
                    className="rounded border bg-background px-2 py-1 text-xs"
                    value={getComparator(check)}
                    onChange={(e) =>
                      setCheckComparator(ruleIdx, checkIdx, e.target.value as ComparatorKey, getComparatorValue(check))
                    }
                  >
                    {COMPARATORS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <input
                    className="rounded border bg-background px-2 py-1 text-xs w-40"
                    placeholder={getComparator(check) === "in" || getComparator(check) === "not_in" ? "val1, val2, val3" : "value"}
                    value={getComparatorValue(check)}
                    onChange={(e) =>
                      setCheckComparator(ruleIdx, checkIdx, getComparator(check), e.target.value)
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground"
                    onClick={() => removeCheck(ruleIdx, checkIdx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              <Button variant="ghost" size="sm" className="text-xs" onClick={() => addCheck(ruleIdx)}>
                <Plus className="h-3 w-3 mr-1" /> Add check
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={() => setRules((prev) => [...prev, emptyRule()])}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add rule
          </Button>
        </CardContent>
      </Card>

      {/* On Enter Actions */}
      <Card size="sm">
        <CardHeader>
          <CardTitle>On Enter</CardTitle>
          <p className="text-xs text-muted-foreground">Actions to run when this mode activates.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {onEnter.map((action, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <select
                className="rounded border bg-background px-2 py-1 text-xs"
                value={action.switch_page ? "switch_page" : "trigger_action"}
                onChange={(e) => {
                  const type = e.target.value;
                  setOnEnter((prev) =>
                    prev.map((a, i) =>
                      i === idx
                        ? type === "switch_page"
                          ? { switch_page: a.switch_page ?? "" }
                          : { trigger_action: a.trigger_action ?? "" }
                        : a
                    )
                  );
                }}
              >
                <option value="switch_page">Switch page</option>
                <option value="trigger_action">Trigger action</option>
              </select>
              <input
                className="rounded border bg-background px-2 py-1 text-xs flex-1"
                placeholder={action.switch_page !== undefined ? "page ID" : "plugin.action"}
                value={action.switch_page ?? action.trigger_action ?? ""}
                onChange={(e) =>
                  setOnEnter((prev) =>
                    prev.map((a, i) =>
                      i === idx
                        ? a.switch_page !== undefined
                          ? { switch_page: e.target.value }
                          : { trigger_action: e.target.value, params: a.params }
                        : a
                    )
                  )
                }
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground"
                onClick={() => setOnEnter((prev) => prev.filter((_, i) => i !== idx))}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setOnEnter((prev) => [...prev, { switch_page: "" }])}
          >
            <Plus className="h-3 w-3 mr-1" /> Add action
          </Button>
        </CardContent>
      </Card>

      {/* On Exit Actions */}
      <Card size="sm">
        <CardHeader>
          <CardTitle>On Exit</CardTitle>
          <p className="text-xs text-muted-foreground">Actions to run when this mode deactivates.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {onExit.map((action, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <select
                className="rounded border bg-background px-2 py-1 text-xs"
                value={action.switch_page ? "switch_page" : "trigger_action"}
                onChange={(e) => {
                  const type = e.target.value;
                  setOnExit((prev) =>
                    prev.map((a, i) =>
                      i === idx
                        ? type === "switch_page"
                          ? { switch_page: a.switch_page ?? "" }
                          : { trigger_action: a.trigger_action ?? "" }
                        : a
                    )
                  );
                }}
              >
                <option value="switch_page">Switch page</option>
                <option value="trigger_action">Trigger action</option>
              </select>
              <input
                className="rounded border bg-background px-2 py-1 text-xs flex-1"
                placeholder={action.switch_page !== undefined ? "page ID" : "plugin.action"}
                value={action.switch_page ?? action.trigger_action ?? ""}
                onChange={(e) =>
                  setOnExit((prev) =>
                    prev.map((a, i) =>
                      i === idx
                        ? a.switch_page !== undefined
                          ? { switch_page: e.target.value }
                          : { trigger_action: e.target.value, params: a.params }
                        : a
                    )
                  )
                }
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground"
                onClick={() => setOnExit((prev) => prev.filter((_, i) => i !== idx))}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setOnExit((prev) => [...prev, { switch_page: "" }])}
          >
            <Plus className="h-3 w-3 mr-1" /> Add action
          </Button>
        </CardContent>
      </Card>

      {/* Save / Delete */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        {onDelete && (
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete mode
          </Button>
        )}
      </div>
    </div>
  );
}

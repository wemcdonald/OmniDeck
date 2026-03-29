import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ModeConfig, type ActiveModeInfo, type ModeHistoryEntry } from "../lib/api.ts";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Icon } from "@iconify/react";
import { Plus, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import ModeEditor from "../components/ModeEditor.tsx";
import ModeLivePreview from "../components/ModeLivePreview.tsx";
import ModeHistoryTimeline from "../components/ModeHistoryTimeline.tsx";

export default function Modes() {
  const queryClient = useQueryClient();
  const [activeMode, setActiveMode] = useState<ActiveModeInfo | null>(null);
  const [override, setOverride] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const ws = useWebSocket();

  const { data: modes = {} } = useQuery({
    queryKey: ["config", "modes"],
    queryFn: () => api.modes.list().catch(() => ({}) as Record<string, ModeConfig>),
  });

  const { data: activeModeData } = useQuery({
    queryKey: ["status", "activeMode"],
    queryFn: () => api.status.activeMode().catch(() => null),
  });

  const { data: history = [] } = useQuery({
    queryKey: ["status", "modeHistory"],
    queryFn: () => api.status.modeHistory().catch(() => [] as ModeHistoryEntry[]),
  });

  const { data: overrideData } = useQuery({
    queryKey: ["status", "modeOverride"],
    queryFn: () => api.status.modeOverride().catch(() => ({ override: null })),
  });

  // Sync query data to local state
  useEffect(() => {
    if (activeModeData !== undefined) setActiveMode(activeModeData);
  }, [activeModeData]);

  useEffect(() => {
    if (overrideData !== undefined) setOverride(overrideData?.override ?? null);
  }, [overrideData]);

  // Live mode change updates via WebSocket
  useEffect(() => {
    return ws.subscribe("mode:change", (msg) => {
      const data = msg.data as { to: ActiveModeInfo | null };
      setActiveMode(data.to);
    });
  }, [ws]);

  function invalidateModes() {
    queryClient.invalidateQueries({ queryKey: ["config", "modes"] });
    queryClient.invalidateQueries({ queryKey: ["status", "activeMode"] });
    queryClient.invalidateQueries({ queryKey: ["status", "modeHistory"] });
    queryClient.invalidateQueries({ queryKey: ["status", "modeOverride"] });
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, config }: { id: string; config: ModeConfig }) =>
      api.modes.save(id, config),
    onSuccess: () => invalidateModes(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.modes.delete(id),
    onSuccess: () => invalidateModes(),
  });

  async function handleSave(id: string, config: ModeConfig) {
    await saveMutation.mutateAsync({ id, config });
    setEditingId(null);
    setCreating(false);
  }

  async function handleDelete(id: string) {
    await deleteMutation.mutateAsync(id);
    setEditingId(null);
  }

  async function handleReorder(id: string, direction: "up" | "down") {
    const entries = Object.entries(modes);
    const idx = entries.findIndex(([key]) => key === id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= entries.length) return;

    const [, modeA] = entries[idx];
    const [, modeB] = entries[swapIdx];
    const priA = modeA.priority ?? 50;
    const priB = modeB.priority ?? 50;

    await api.modes.save(entries[idx][0], { ...modeA, priority: priB });
    await api.modes.save(entries[swapIdx][0], { ...modeB, priority: priA });
    invalidateModes();
  }

  // Sort modes by priority
  const sortedModes = Object.entries(modes).sort(
    ([, a], [, b]) => (a.priority ?? 50) - (b.priority ?? 50)
  );

  if (editingId !== null) {
    return (
      <ModeEditor
        id={editingId}
        config={modes[editingId]}
        onSave={handleSave}
        onCancel={() => setEditingId(null)}
        onDelete={() => handleDelete(editingId)}
      />
    );
  }

  if (creating) {
    return (
      <ModeEditor
        id=""
        config={undefined}
        onSave={handleSave}
        onCancel={() => setCreating(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display">Modes</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Inferred contexts that drive page switching, HA automations, and button behavior.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Mode
        </Button>
      </div>

      {activeMode?.id && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          Active: <span className="font-medium text-foreground">{activeMode.name}</span>
        </div>
      )}

      {sortedModes.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No modes configured. Create one to get started.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {sortedModes.map(([id, mode], idx) => {
          const isActive = activeMode?.id === id;
          return (
            <Card key={id} size="sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  {mode.icon && (
                    <Icon
                      icon={mode.icon.replace("ms:", "material-symbols:")}
                      className="h-5 w-5 text-muted-foreground"
                    />
                  )}
                  <CardTitle>{mode.name}</CardTitle>
                  {isActive && (
                    <Badge variant="success">
                      Active
                    </Badge>
                  )}
                </div>
                <CardAction>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleReorder(id, "up")}
                      disabled={idx === 0}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleReorder(id, "down")}
                      disabled={idx === sortedModes.length - 1}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(id)}
                      className="h-7 w-7 p-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardAction>
                <CardDescription>
                  Priority <span className="font-mono">{mode.priority ?? 50}</span> · {mode.rules.length} rule{mode.rules.length !== 1 ? "s" : ""}
                  {mode.on_enter?.length ? ` · ${mode.on_enter.length} on-enter action${mode.on_enter.length !== 1 ? "s" : ""}` : ""}
                </CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {/* Manual Override */}
      {sortedModes.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Manual Override</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <select
                className="rounded border bg-background px-2 py-1 text-xs"
                value={override ?? "auto"}
                onChange={async (e) => {
                  const val = e.target.value;
                  try {
                    await fetch("/api/deck/press/0", { method: "POST" }).catch(() => {});
                    const body = val === "auto" ? null : val;
                    setOverride(body);
                  } catch { /* ignore */ }
                }}
              >
                <option value="auto">Automatic (rule-based)</option>
                {sortedModes.map(([id, mode]) => (
                  <option key={id} value={id}>{mode.name}</option>
                ))}
              </select>
              {override && (
                <Badge variant="warning">
                  Override active
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Preview */}
      {sortedModes.length > 0 && (
        <div className="pt-2">
          <ModeLivePreview />
        </div>
      )}

      {/* Mode History Timeline */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Mode History</CardTitle>
        </CardHeader>
        <CardContent>
          <ModeHistoryTimeline history={history} />
        </CardContent>
      </Card>
    </div>
  );
}

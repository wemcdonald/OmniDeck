import { useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ModeEvalResult, type CheckResult, type RuleResult } from "../lib/api.ts";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

function CheckResultRow({ check }: { check: CheckResult }) {
  const actualStr =
    check.actualValue === undefined ? "undefined" : JSON.stringify(check.actualValue);

  const expectedStr =
    check.expectedValue === undefined ? "---" : JSON.stringify(check.expectedValue);

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded px-2 py-1 text-xs font-mono",
        check.passes ? "bg-success/10" : "bg-destructive/10"
      )}
    >
      {check.passes ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <span className="text-muted-foreground">{check.provider}</span>
          <span className="text-foreground">.{check.attribute}</span>
          <span className="text-muted-foreground">{check.comparator}</span>
          <span className="text-blue-400">{expectedStr}</span>
        </div>
        <div className="mt-0.5 text-muted-foreground">
          {!check.providerFound ? (
            <span className="text-amber-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> provider not found
            </span>
          ) : (
            <>
              actual: <span className={check.passes ? "text-green-400" : "text-red-400"}>{actualStr}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleResultCard({ rule, index }: { rule: RuleResult; index: number }) {
  return (
    <div className={cn(
      "rounded border border-outline-variant p-2 space-y-1.5",
      rule.passes ? "border-green-500/30" : "border-red-500/30"
    )}>
      <div className="flex items-center gap-2 text-xs">
        {rule.passes ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-red-500" />
        )}
        <span className="font-mono text-muted-foreground">
          Rule {index + 1}
        </span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {rule.condition === "and" ? "ALL" : "ANY"}
        </Badge>
        <Badge variant={rule.passes ? "success" : "error"} className="text-[10px]">
          {rule.passes ? "Pass" : "Fail"}
        </Badge>
      </div>
      <div className="space-y-1 pl-1">
        {rule.checks.map((check, ci) => (
          <CheckResultRow key={ci} check={check} />
        ))}
      </div>
    </div>
  );
}

function ModeEvalCard({ mode }: { mode: ModeEvalResult }) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">{mode.name}</CardTitle>
          {mode.active ? (
            <Badge variant="success" className="text-[10px]">
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Inactive
            </Badge>
          )}
          <span className="text-[10px] font-mono text-muted-foreground ml-auto">
            priority {mode.priority}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {mode.rules.map((rule, ri) => (
          <RuleResultCard key={ri} rule={rule} index={ri} />
        ))}
      </CardContent>
    </Card>
  );
}

interface Props {
  /** If set, only show this mode's evaluation. Otherwise show all. */
  modeId?: string;
}

export default function ModeLivePreview({ modeId }: Props) {
  const queryClient = useQueryClient();
  const ws = useWebSocket();

  const { data: results = [], isLoading: loading } = useQuery({
    queryKey: ["status", "debugModes"],
    queryFn: () => api.status.debugModes().catch(() => [] as ModeEvalResult[]),
    refetchInterval: 3000,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["status", "debugModes"] });
  }, [queryClient]);

  // Auto-refresh on any mode change or state update
  useEffect(() => {
    const unsub1 = ws.subscribe("mode:change", () => refresh());
    const unsub2 = ws.subscribe("agent:update", () => refresh());
    const unsub3 = ws.subscribe("deck:update", () => refresh());
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [ws, refresh]);

  const filtered = modeId ? results.filter((r) => r.id === modeId) : results;

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        Loading evaluation...
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No modes to evaluate.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Live Evaluation</h3>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={refresh}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>
      {filtered.map((mode) => (
        <ModeEvalCard key={mode.id} mode={mode} />
      ))}
    </div>
  );
}

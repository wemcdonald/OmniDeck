import { useState } from "react";
import { Plus, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { api, type BrowsePlugin, type PluginCatalog } from "../lib/api.ts";
import PluginConfigCard from "../components/PluginConfigCard.tsx";
import { PluginInstallModal } from "../components/PluginInstallModal.tsx";
import { Button } from "../components/ui/button.tsx";
import { Badge } from "../components/ui/badge.tsx";

const BUILTIN_IDS = new Set(["core", "sound", "os-control"]);

interface PluginStatus {
  id: string;
  name: string;
  version: string;
  icon?: string;
  status: string;
  health?: { status: string; message?: string };
  downloads?: Array<{ name: string; label: string; path: string; description?: string }>;
  setup_steps?: string[];
  source_url?: string;
}

function PluginIcon({ icon, name }: { icon?: string; name: string }) {
  if (icon?.startsWith("ms:")) {
    return (
      <Icon
        icon={`material-symbols:${icon.slice(3)}`}
        className="w-5 h-5 shrink-0 text-muted-foreground"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="w-5 h-5 shrink-0 rounded text-[10px] font-bold bg-surface-container-high text-muted-foreground flex items-center justify-center leading-none">
      {initials}
    </span>
  );
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

function renderSetupStep(step: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = linkRe.exec(step)) !== null) {
    if (m.index > last) parts.push(step.slice(last, m.index));
    if (m[1] && m[2]) {
      parts.push(
        <a key={idx++} href={m[2]} target="_blank" rel="noopener noreferrer" className="underline text-primary">
          {m[1]}
        </a>
      );
    } else if (m[3]) {
      parts.push(<code key={idx++} className="bg-surface-container-highest rounded px-1 text-xs font-mono">{m[3]}</code>);
    }
    last = m.index + m[0].length;
  }
  if (last < step.length) parts.push(step.slice(last));
  return parts;
}

interface PluginRowProps {
  plugin: PluginStatus;
  config: Record<string, unknown>;
  secretFields: string[];
  configFields?: import("../lib/api.ts").PluginCatalogEntry["configFields"];
  catalogEntry?: import("../lib/api.ts").PluginCatalogEntry;
  onSaved(): void;
}

function PluginRow({ plugin, config, secretFields, configFields, catalogEntry, onSaved }: PluginRowProps) {
  const [expanded, setExpanded] = useState(false);

  const presetCount = catalogEntry?.presets.length ?? 0;
  const actionCount = catalogEntry?.actions.length ?? 0;
  const capabilityText =
    presetCount > 0 || actionCount > 0
      ? [
          presetCount > 0 ? `${presetCount} preset${presetCount !== 1 ? "s" : ""}` : null,
          actionCount > 0 ? `${actionCount} action${actionCount !== 1 ? "s" : ""}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  const showSetupSteps =
    plugin.setup_steps &&
    plugin.setup_steps.length > 0 &&
    plugin.health?.status !== "ok";

  return (
    <div className="rounded border border-outline-variant bg-surface-container overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-surface-container-high transition-colors"
      >
        <PluginIcon icon={plugin.icon} name={plugin.name} />
        <span className="font-semibold text-sm">{plugin.name}</span>
        {plugin.version && (
          <span className="text-xs text-muted-foreground shrink-0">v{plugin.version}</span>
        )}
        {healthBadge(plugin.health)}
        <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
          {capabilityText}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-outline-variant px-3 pb-3 pt-2 space-y-3">
          {showSetupSteps && (
            <div className="rounded bg-amber-500/10 border border-amber-500/30 px-3 py-2 space-y-1.5">
              <p className="text-xs font-semibold text-amber-400">Setup required</p>
              <ol className="list-decimal list-inside space-y-1">
                {plugin.setup_steps!.map((step, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    {renderSetupStep(step)}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <PluginConfigCard
            id={plugin.id}
            name={plugin.name}
            version={plugin.version}
            icon={plugin.icon}
            health={plugin.health}
            downloads={plugin.downloads}
            config={config}
            secretFields={secretFields}
            configFields={configFields}
            onSaved={onSaved}
            embedded
          />

          {plugin.source_url && (
            <a
              href={plugin.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              View source
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function Plugins() {
  const [installOpen, setInstallOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: statuses = [] } = useQuery({
    queryKey: ["status", "plugins"],
    queryFn: () => api.status.plugins().catch(() => []) as Promise<PluginStatus[]>,
  });

  const { data: pluginsData } = useQuery({
    queryKey: ["config", "plugins"],
    queryFn: () => api.plugins.list().catch(() => ({ plugins: {}, secretRefs: {} })),
  });
  const configs = pluginsData?.plugins ?? {};
  const secretRefs = (pluginsData?.secretRefs ?? {}) as Record<string, string[]>;

  const { data: catalog } = useQuery({
    queryKey: ["status", "plugin-catalog"],
    queryFn: () => api.status.pluginCatalog().catch(() => ({ plugins: [] })) as Promise<PluginCatalog>,
  });

  const { data: browsePlugins } = useQuery({
    queryKey: ["plugins", "browse"],
    queryFn: () => api.plugins.browse().then((d) => d.plugins).catch(() => [] as BrowsePlugin[]),
  });

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["status", "plugins"] });
    queryClient.invalidateQueries({ queryKey: ["config", "plugins"] });
  }

  const builtinPlugins = statuses.filter((p) => BUILTIN_IDS.has(p.id));
  const installedPlugins = statuses.filter((p) => !BUILTIN_IDS.has(p.id));

  function renderSection(label: string, plugins: PluginStatus[]) {
    if (plugins.length === 0) return null;
    return (
      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
          {label}
        </h3>
        {plugins.map((plugin) => {
          const catalogEntry = catalog?.plugins?.find((p) => p.id === plugin.id);
          return (
            <PluginRow
              key={plugin.id}
              plugin={plugin}
              config={(configs as Record<string, Record<string, unknown>>)[plugin.id] ?? {}}
              secretFields={secretRefs[plugin.id] ?? []}
              configFields={catalogEntry?.configFields}
              catalogEntry={catalogEntry}
              onSaved={handleRefresh}
            />
          );
        })}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold font-display">Plugins</h2>
        <Button onClick={() => setInstallOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Install Plugin
        </Button>
      </div>

      {statuses.length === 0 && (
        <p className="text-muted-foreground text-sm">No plugins loaded.</p>
      )}

      {renderSection("Built-in", builtinPlugins)}
      {renderSection("Installed", installedPlugins)}

      <PluginInstallModal
        open={installOpen}
        prefetchedBrowse={browsePlugins ?? null}
        onClose={() => {
          setInstallOpen(false);
          handleRefresh();
        }}
      />
    </div>
  );
}

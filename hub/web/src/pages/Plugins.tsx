import { useState } from "react";
import { Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type BrowsePlugin, type PluginCatalog } from "../lib/api.ts";
import PluginConfigCard from "../components/PluginConfigCard.tsx";
import { PluginInstallModal } from "../components/PluginInstallModal.tsx";
import { Button } from "../components/ui/button.tsx";

interface PluginStatus {
  id: string;
  name: string;
  version: string;
  icon?: string;
  status: string;
  health?: { status: string; message?: string };
  downloads?: Array<{ name: string; label: string; path: string; description?: string }>;
}

export default function Plugins() {
  const [installOpen, setInstallOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: statuses = [] } = useQuery({
    queryKey: ["status", "plugins"],
    queryFn: () => api.status.plugins().catch(() => []) as Promise<PluginStatus[]>,
  });

  const { data: configs = {} } = useQuery({
    queryKey: ["config", "plugins"],
    queryFn: () => api.plugins.list().catch(() => ({})) as Promise<Record<string, Record<string, unknown>>>,
  });

  const { data: catalog } = useQuery({
    queryKey: ["status", "plugin-catalog"],
    queryFn: () => api.status.pluginCatalog().catch(() => ({ plugins: [] })) as Promise<PluginCatalog>,
  });

  // Pre-fetch browse list so the install modal opens instantly
  const { data: browsePlugins } = useQuery({
    queryKey: ["plugins", "browse"],
    queryFn: () => api.plugins.browse().then((d) => d.plugins).catch(() => [] as BrowsePlugin[]),
  });

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["status", "plugins"] });
    queryClient.invalidateQueries({ queryKey: ["config", "plugins"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold font-display">Plugins</h2>
        <Button onClick={() => setInstallOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Install Plugin
        </Button>
      </div>
      {statuses.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No plugins loaded.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {statuses.map((plugin) => {
          const catalogEntry = catalog?.plugins?.find(p => p.id === plugin.id);
          return (
            <PluginConfigCard
              key={plugin.id}
              id={plugin.id}
              name={plugin.name}
              version={plugin.version}
              icon={plugin.icon}
              health={plugin.health}
              downloads={plugin.downloads}
              config={(configs as Record<string, Record<string, unknown>>)[plugin.id] ?? {}}
              configFields={catalogEntry?.configFields}
              onSaved={handleRefresh}
            />
          );
        })}
      </div>

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

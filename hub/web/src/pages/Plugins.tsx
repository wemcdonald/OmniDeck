import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../lib/api.ts";
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
}

export default function Plugins() {
  const [statuses, setStatuses] = useState<PluginStatus[]>([]);
  const [configs, setConfigs] = useState<Record<string, Record<string, unknown>>>({});
  const [installOpen, setInstallOpen] = useState(false);

  async function load() {
    const [statusData, configData] = await Promise.all([
      api.status.plugins().catch(() => []),
      api.plugins.list().catch(() => ({})),
    ]);
    setStatuses(statusData as PluginStatus[]);
    setConfigs(configData as Record<string, Record<string, unknown>>);
  }

  useEffect(() => {
    load();
  }, []);

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
        {statuses.map((plugin) => (
          <PluginConfigCard
            key={plugin.id}
            id={plugin.id}
            name={plugin.name}
            version={plugin.version}
            icon={plugin.icon}
            health={plugin.health}
            config={configs[plugin.id] ?? {}}
            onSaved={load}
          />
        ))}
      </div>

      <PluginInstallModal
        open={installOpen}
        onClose={() => {
          setInstallOpen(false);
          load();
        }}
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import PluginConfigCard from "../components/PluginConfigCard.tsx";

export default function Plugins() {
  const [plugins, setPlugins] = useState<Record<string, Record<string, unknown>>>({});

  async function load() {
    const data = await api.plugins.list().catch(() => ({}));
    setPlugins(data as Record<string, Record<string, unknown>>);
  }

  useEffect(() => {
    load();
  }, []);

  const entries = Object.entries(plugins);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Plugins</h2>
      {entries.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No plugins configured. Add plugins to main.yaml.
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {entries.map(([id, config]) => (
          <PluginConfigCard
            key={id}
            id={id}
            config={config}
            onSaved={load}
          />
        ))}
      </div>
    </div>
  );
}

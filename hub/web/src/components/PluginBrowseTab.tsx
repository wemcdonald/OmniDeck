import { useEffect, useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import { api, type BrowsePlugin, type InstallResult } from "../lib/api.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./ui/card.tsx";
import { PluginPreview } from "./PluginPreview.tsx";

interface PluginBrowseTabProps {
  onClose: () => void;
}

export function PluginBrowseTab({ onClose }: PluginBrowseTabProps) {
  const [plugins, setPlugins] = useState<BrowsePlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [installedPlugins, setInstalledPlugins] = useState<Record<string, string>>({});

  // Install flow state
  const [selectedPlugin, setSelectedPlugin] = useState<BrowsePlugin | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);

  async function loadPlugins() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.plugins.browse();
      setPlugins(data.plugins);
    } catch (err) {
      setError("Failed to load plugins from GitHub");
    } finally {
      setLoading(false);
    }
  }

  async function loadInstalled() {
    try {
      const statuses = await api.status.plugins();
      const map: Record<string, string> = {};
      for (const s of statuses) {
        map[s.id] = s.version;
      }
      setInstalledPlugins(map);
    } catch {
      // Ignore — installed list is optional enrichment
    }
  }

  useEffect(() => {
    loadPlugins();
    loadInstalled();
  }, []);

  const filtered = plugins.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  async function handleInstall(plugin: BrowsePlugin, overwrite: boolean) {
    setInstalling(true);
    try {
      const url = `https://github.com/wemcdonald/OmniDeck-plugins/tree/main/${plugin.dirName}`;
      const result = await api.plugins.installFromGitHub(url, overwrite);

      if (result.status === "conflict") {
        setInstallResult(result);
      } else if (result.status === "installed") {
        setInstallResult(result);
      } else {
        setInstallResult(result);
      }
    } catch (err) {
      setInstallResult({
        status: "error",
        errors: [(err as Error).message],
      });
    } finally {
      setInstalling(false);
    }
  }

  // Success state
  if (installResult?.status === "installed") {
    return (
      <div className="text-center space-y-3 py-8">
        <p className="text-sm font-medium">
          Plugin &ldquo;{installResult.plugin?.name}&rdquo; installed!
        </p>
        <p className="text-sm text-muted-foreground">
          Restart the hub to activate.
        </p>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  // Preview / conflict state
  if (selectedPlugin && !installResult) {
    return (
      <PluginPreview
        manifest={{
          id: selectedPlugin.id,
          name: selectedPlugin.name,
          description: selectedPlugin.description,
          version: selectedPlugin.version,
          platforms: selectedPlugin.platforms,
        }}
        installedVersion={installedPlugins[selectedPlugin.id]}
        loading={installing}
        onConfirm={(overwrite) => handleInstall(selectedPlugin, overwrite)}
        onCancel={() => setSelectedPlugin(null)}
      />
    );
  }

  // Conflict returned from server
  if (installResult?.status === "conflict" && selectedPlugin) {
    return (
      <PluginPreview
        manifest={{
          id: selectedPlugin.id,
          name: selectedPlugin.name,
          description: selectedPlugin.description,
          version: selectedPlugin.version,
          platforms: selectedPlugin.platforms,
        }}
        installedVersion={installResult.installed?.version}
        loading={installing}
        onConfirm={() => handleInstall(selectedPlugin, true)}
        onCancel={() => {
          setSelectedPlugin(null);
          setInstallResult(null);
        }}
      />
    );
  }

  // Error state from install
  if (installResult?.status === "error") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-destructive">Installation failed</p>
        <ul className="text-sm text-muted-foreground list-disc pl-4">
          {installResult.errors?.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
        <Button
          variant="outline"
          onClick={() => {
            setInstallResult(null);
            setSelectedPlugin(null);
          }}
        >
          Back
        </Button>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 rounded-xl bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center space-y-3 py-8">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={loadPlugins}>
          <RefreshCw className="h-3 w-3 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  // Empty state
  if (plugins.length === 0) {
    return (
      <div className="text-center space-y-3 py-8">
        <p className="text-sm text-muted-foreground">No plugins available</p>
        <Button variant="outline" onClick={loadPlugins}>
          <RefreshCw className="h-3 w-3 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  // Browse grid
  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          className="w-full rounded border px-2 py-1.5 pl-8 text-sm bg-background"
          placeholder="Search plugins..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((plugin) => {
          const installed = installedPlugins[plugin.id];
          const isUpdate = installed && installed !== plugin.version;

          return (
            <Card key={plugin.id} size="sm">
              <CardHeader>
                <CardTitle>{plugin.name}</CardTitle>
                {plugin.description && (
                  <CardDescription className="line-clamp-2">
                    {plugin.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{plugin.version}</Badge>
                  {plugin.platforms.map((p) => (
                    <Badge key={p} variant="outline">
                      {p}
                    </Badge>
                  ))}
                  {installed && !isUpdate && (
                    <Badge variant="default">Installed</Badge>
                  )}
                  {isUpdate && (
                    <Badge variant="destructive">Update available</Badge>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  size="sm"
                  variant={isUpdate ? "secondary" : "default"}
                  onClick={() => setSelectedPlugin(plugin)}
                >
                  {isUpdate ? "Update" : installed ? "Reinstall" : "Install"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No plugins match your search.
        </p>
      )}
    </div>
  );
}

import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";

interface PluginPreviewProps {
  manifest: {
    id: string;
    name: string;
    description?: string;
    version: string;
    platforms: string[];
    hub?: string;
    agent?: string;
  };
  /** If set, shows the conflict UI with installed version */
  installedVersion?: string;
  loading?: boolean;
  onConfirm: (overwrite: boolean) => void;
  onCancel: () => void;
}

export function PluginPreview({
  manifest,
  installedVersion,
  loading,
  onConfirm,
  onCancel,
}: PluginPreviewProps) {
  const isUpdate = !!installedVersion;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{manifest.name}</h3>
        <p className="text-xs text-muted-foreground">{manifest.id}</p>
      </div>

      {manifest.description && (
        <p className="text-sm text-muted-foreground">{manifest.description}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{manifest.version}</Badge>
        {manifest.platforms.map((p) => (
          <Badge key={p} variant="outline">
            {p}
          </Badge>
        ))}
      </div>

      <div className="flex gap-2 text-sm text-muted-foreground">
        {manifest.hub && <span>Hub extension</span>}
        {manifest.hub && manifest.agent && <span>&middot;</span>}
        {manifest.agent && <span>Agent extension</span>}
        {!manifest.hub && !manifest.agent && <span>No extensions</span>}
      </div>

      {isUpdate && (
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p>
            <span className="font-medium">Already installed:</span> v{installedVersion}
          </p>
          <p>
            <span className="font-medium">New version:</span> v{manifest.version}
          </p>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={() => onConfirm(isUpdate)} disabled={loading}>
          {loading
            ? "Installing..."
            : isUpdate
              ? "Overwrite"
              : "Confirm Install"}
        </Button>
      </div>
    </div>
  );
}

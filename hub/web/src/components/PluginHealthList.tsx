import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface PluginStatus {
  id: string;
  status: string;
  version: string;
  error?: string;
}

interface Props {
  plugins: PluginStatus[];
}

export default function PluginHealthList({ plugins }: Props) {
  const isHealthy = (status: string) =>
    status === "running" || status === "active";

  return (
    <Card className="bg-surface-container rounded border border-outline-variant dark:border-outline">
      <div className="px-6 pt-6 pb-2">
        <h3 className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">
          Plugin Health
        </h3>
      </div>
      <CardContent>
        {plugins.length === 0 && (
          <p className="text-sm text-muted-foreground">No plugins loaded</p>
        )}
        <ul className="space-y-2">
          {plugins.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-sm font-medium">{p.id}</span>
                <span className="font-mono text-xs text-muted-foreground ml-2">v{p.version}</span>
                {p.error && (
                  <p className="text-destructive font-mono text-xs mt-0.5">{p.error}</p>
                )}
              </div>
              <Badge variant={isHealthy(p.status) ? "success" : "error"}>
                {p.status}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

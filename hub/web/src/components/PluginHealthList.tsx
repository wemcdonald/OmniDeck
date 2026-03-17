import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Plugin Health</CardTitle>
      </CardHeader>
      <CardContent>
        {plugins.length === 0 && (
          <p className="text-sm text-muted-foreground">No plugins loaded</p>
        )}
        <ul className="space-y-2">
          {plugins.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-2">
              <div>
                <span className="text-sm font-medium">{p.id}</span>
                <span className="text-xs text-muted-foreground ml-2">v{p.version}</span>
                {p.error && (
                  <p className="text-xs text-red-500 mt-0.5">{p.error}</p>
                )}
              </div>
              <Badge variant={p.status === "active" ? "default" : "destructive"}>
                {p.status}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

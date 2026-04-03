import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { useLogStream } from "../hooks/useLogStream.ts";
import { LogList } from "./LogList.tsx";

export default function RecentLogs() {
  const lines = useLogStream(50);

  return (
    <Card className="bg-surface-container rounded border border-outline-variant dark:border-outline">
      <div className="px-6 pt-6 pb-2 flex items-center justify-between">
        <h3 className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">
          Recent Activity
        </h3>
        <Link to="/logs" className="text-xs text-primary hover:underline">
          View all →
        </Link>
      </div>
      <CardContent>
        <LogList lines={lines} maxHeight="max-h-48" />
      </CardContent>
    </Card>
  );
}

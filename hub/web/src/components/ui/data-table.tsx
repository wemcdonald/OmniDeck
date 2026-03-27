import * as React from "react";
import { cn } from "@/lib/utils";

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyFn: (item: T) => string;
  /** Render function for mobile card view */
  mobileCard?: (item: T) => React.ReactNode;
  className?: string;
  emptyMessage?: string;
}

export function DataTable<T>({
  data,
  columns,
  keyFn,
  mobileCard,
  className,
  emptyMessage = "No data",
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">{emptyMessage}</p>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className={cn("hidden lg:block overflow-x-auto", className)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "text-left text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr
                key={keyFn(item)}
                className="border-b border-border/50 hover:bg-surface-container-high transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn("px-3 py-2.5 font-mono text-sm", col.className)}
                  >
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="lg:hidden space-y-2">
        {mobileCard
          ? data.map((item) => (
              <div key={keyFn(item)}>{mobileCard(item)}</div>
            ))
          : data.map((item) => (
              <div
                key={keyFn(item)}
                className="rounded bg-surface-container border border-outline-variant p-3 space-y-1"
              >
                {columns
                  .filter((col) => !col.hideOnMobile)
                  .map((col) => (
                    <div key={col.key} className="flex justify-between text-sm">
                      <span className="text-xs font-display uppercase tracking-wide text-muted-foreground">
                        {col.header}
                      </span>
                      <span className="font-mono">{col.render(item)}</span>
                    </div>
                  ))}
              </div>
            ))}
      </div>
    </>
  );
}

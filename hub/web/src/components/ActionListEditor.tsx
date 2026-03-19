import { useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, Trash2, Plus } from "lucide-react";
import type { PluginCatalog, CatalogAction } from "../lib/api";
import ParamField from "./ParamField";

interface ActionItem {
  action: string;
  params?: Record<string, unknown>;
}

interface ActionListEditorProps {
  value: ActionItem[];
  onChange(value: ActionItem[]): void;
  catalog: PluginCatalog;
  depth?: number;
}

function findActionInCatalog(
  catalog: PluginCatalog,
  qualifiedId: string,
): CatalogAction | undefined {
  for (const plugin of catalog.plugins) {
    const action = plugin.actions.find((a) => a.qualifiedId === qualifiedId);
    if (action) return action;
  }
  return undefined;
}

export default function ActionListEditor({
  value,
  onChange,
  catalog,
  depth = 0,
}: ActionListEditorProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (depth >= 2) {
    return (
      <p className="text-xs text-muted-foreground italic px-2 py-1">
        Max nesting reached
      </p>
    );
  }

  function updateItem(index: number, updated: ActionItem) {
    const next = [...value];
    next[index] = updated;
    onChange(next);
  }

  function removeItem(index: number) {
    const next = value.filter((_, i) => i !== index);
    onChange(next);
    if (expandedIndex === index) setExpandedIndex(null);
    else if (expandedIndex !== null && expandedIndex > index)
      setExpandedIndex(expandedIndex - 1);
  }

  function addItem() {
    onChange([...value, { action: "" }]);
    setExpandedIndex(value.length);
  }

  function toggleExpand(index: number) {
    setExpandedIndex(expandedIndex === index ? null : index);
  }

  return (
    <div className="space-y-1">
      {value.map((item, index) => {
        const actionMeta = item.action
          ? findActionInCatalog(catalog, item.action)
          : undefined;
        const isExpanded = expandedIndex === index;
        const paramCount = item.params ? Object.keys(item.params).length : 0;

        return (
          <div
            key={index}
            className="border rounded bg-background"
          >
            {/* Row header */}
            <div className="flex items-center gap-1 px-2 py-1.5">
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0 cursor-grab" />

              {/* Action picker */}
              <select
                className="flex-1 rounded border px-2 py-1 text-sm bg-background min-w-0"
                value={item.action}
                onChange={(e) =>
                  updateItem(index, { action: e.target.value, params: {} })
                }
              >
                <option value="">Select action…</option>
                {catalog.plugins.map((plugin) =>
                  plugin.actions.length > 0 ? (
                    <optgroup key={plugin.id} label={plugin.name}>
                      {plugin.actions.map((a) => (
                        <option key={a.qualifiedId} value={a.qualifiedId}>
                          {a.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null,
                )}
              </select>

              {/* Param summary */}
              {paramCount > 0 && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {paramCount} param{paramCount !== 1 ? "s" : ""}
                </span>
              )}

              {/* Expand/collapse */}
              <button
                onClick={() => toggleExpand(index)}
                className="p-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>

              {/* Delete */}
              <button
                onClick={() => removeItem(index)}
                className="p-0.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                title="Remove action"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Expanded params */}
            {isExpanded && actionMeta && actionMeta.fields.length > 0 && (
              <div className="px-3 pb-2 space-y-2 border-t">
                {actionMeta.fields.map((f) => (
                  <ParamField
                    key={f.key}
                    field={f}
                    value={item.params?.[f.key]}
                    onChange={(v) =>
                      updateItem(index, {
                        ...item,
                        params: { ...item.params, [f.key]: v },
                      })
                    }
                    catalog={catalog}
                    depth={depth + 1}
                  />
                ))}
              </div>
            )}

            {isExpanded && actionMeta && actionMeta.fields.length === 0 && (
              <div className="px-3 pb-2 border-t">
                <p className="text-xs text-muted-foreground py-1">
                  No parameters for this action.
                </p>
              </div>
            )}

            {isExpanded && !item.action && (
              <div className="px-3 pb-2 border-t">
                <p className="text-xs text-muted-foreground py-1">
                  Select an action above.
                </p>
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={addItem}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Action
      </button>
    </div>
  );
}

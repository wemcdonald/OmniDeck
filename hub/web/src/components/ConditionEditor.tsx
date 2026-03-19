import type { PluginCatalog, CatalogStateProvider } from "../lib/api";

interface ConditionValue {
  provider: string;
  variable: string;
  operator: string;
  value: string;
}

interface ConditionEditorProps {
  value: ConditionValue;
  onChange(value: ConditionValue): void;
  catalog: PluginCatalog;
}

const OPERATORS = ["==", "!=", ">", "<", ">=", "<=", "contains"] as const;

function findProviderInCatalog(
  catalog: PluginCatalog,
  qualifiedId: string,
): CatalogStateProvider | undefined {
  for (const plugin of catalog.plugins) {
    const provider = plugin.stateProviders.find(
      (s) => s.qualifiedId === qualifiedId,
    );
    if (provider) return provider;
  }
  return undefined;
}

export default function ConditionEditor({
  value,
  onChange,
  catalog,
}: ConditionEditorProps) {
  const selectedProvider = value.provider
    ? findProviderInCatalog(catalog, value.provider)
    : undefined;
  const templateVars = selectedProvider?.templateVariables ?? [];

  function update(patch: Partial<ConditionValue>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="flex items-end gap-2 flex-wrap">
      {/* State Provider picker */}
      <div className="flex-1 min-w-[140px]">
        <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
          Provider
        </label>
        <select
          className="w-full rounded border px-2 py-1.5 text-sm bg-background"
          value={value.provider}
          onChange={(e) =>
            update({ provider: e.target.value, variable: "" })
          }
        >
          <option value="">Select provider…</option>
          {catalog.plugins.map((plugin) =>
            plugin.stateProviders.length > 0 ? (
              <optgroup key={plugin.id} label={plugin.name}>
                {plugin.stateProviders.map((sp) => (
                  <option key={sp.qualifiedId} value={sp.qualifiedId}>
                    {sp.name}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
      </div>

      {/* Variable picker */}
      <div className="flex-1 min-w-[120px]">
        <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
          Variable
        </label>
        <select
          className="w-full rounded border px-2 py-1.5 text-sm bg-background"
          value={value.variable}
          onChange={(e) => update({ variable: e.target.value })}
          disabled={!value.provider}
        >
          <option value="">Select variable…</option>
          {templateVars.map((tv) => (
            <option key={tv.key} value={tv.key}>
              {tv.label}
            </option>
          ))}
        </select>
      </div>

      {/* Operator */}
      <div className="w-[90px]">
        <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
          Operator
        </label>
        <select
          className="w-full rounded border px-2 py-1.5 text-sm bg-background"
          value={value.operator}
          onChange={(e) => update({ operator: e.target.value })}
        >
          {OPERATORS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      </div>

      {/* Value */}
      <div className="flex-1 min-w-[100px]">
        <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
          Value
        </label>
        <input
          className="w-full rounded border px-2 py-1.5 text-sm bg-background"
          placeholder="Compare to…"
          value={value.value}
          onChange={(e) => update({ value: e.target.value })}
        />
      </div>
    </div>
  );
}

import type { CatalogField, PluginCatalog } from "../lib/api";
import EntityPicker from "./EntityPicker";
import EmojiPicker from "./EmojiPicker";
import MaterialSymbolsPicker from "./MaterialSymbolsPicker";
import ActionListEditor from "./ActionListEditor";
import ConditionEditor from "./ConditionEditor";

interface ParamFieldProps {
  field: CatalogField;
  value: unknown;
  onChange(value: unknown): void;
  catalog?: PluginCatalog;
  depth?: number;
}

export default function ParamField({ field: f, value, onChange, catalog, depth }: ParamFieldProps) {
  const strVal = value != null ? String(value) : "";

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">
        {f.label}
        {f.required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {f.description && (
        <p className="text-[11px] text-muted-foreground mb-1">{f.description}</p>
      )}

      {/* HA Entity picker */}
      {f.fieldType === "ha_entity" && (
        <EntityPicker
          value={strVal}
          onChange={(v) => onChange(v)}
          domain={f.domain}
        />
      )}

      {/* Icon picker */}
      {f.fieldType === "icon" && (
        <div className="flex gap-1">
          <input
            className="flex-1 rounded border px-2 py-1 text-sm bg-background"
            placeholder="emoji or ms:icon_name"
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
          />
          <EmojiPicker value={strVal} onSelect={(e) => onChange(e)} />
          <MaterialSymbolsPicker value={strVal} onSelect={(i) => onChange(i)} />
        </div>
      )}

      {/* Color picker */}
      {f.fieldType === "color" && (
        <input
          type="color"
          value={strVal || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-9 rounded border cursor-pointer p-0.5"
        />
      )}

      {/* Action list */}
      {f.fieldType === "action_list" && catalog && (
        <ActionListEditor
          value={Array.isArray(value) ? (value as Array<{ action: string; params?: Record<string, unknown> }>) : []}
          onChange={(v) => onChange(v)}
          catalog={catalog}
          depth={depth}
        />
      )}

      {/* Condition */}
      {f.fieldType === "condition" && catalog && (
        <ConditionEditor
          value={
            value != null && typeof value === "object" && !Array.isArray(value)
              ? (value as { provider: string; variable: string; operator: string; value: string })
              : { provider: "", variable: "", operator: "==", value: "" }
          }
          onChange={(v) => onChange(v)}
          catalog={catalog}
        />
      )}

      {/* Enum / select */}
      {!f.fieldType && f.zodType === "enum" && f.enumValues && (
        <select
          className="w-full rounded border px-2 py-1.5 text-sm bg-background"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {f.enumValues.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      )}

      {/* Boolean */}
      {!f.fieldType && f.zodType === "boolean" && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">{f.label}</span>
        </label>
      )}

      {/* Number */}
      {!f.fieldType && f.zodType === "number" && (
        <input
          type="number"
          className="w-full rounded border px-2 py-1.5 text-sm bg-background"
          value={value != null ? Number(value) : ""}
          min={f.min}
          max={f.max}
          step={f.step ?? 1}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        />
      )}

      {/* String (default) */}
      {!f.fieldType && (f.zodType === "string" || f.zodType === "object" || f.zodType === "array") && (
        <input
          className="w-full rounded border px-2 py-1.5 text-sm bg-background"
          value={strVal}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {/* Page picker */}
      {f.fieldType === "page" && (
        <input
          className="w-full rounded border px-2 py-1.5 text-sm bg-background"
          value={strVal}
          placeholder="Page ID"
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {/* Agent picker */}
      {f.fieldType === "agent" && (
        <input
          className="w-full rounded border px-2 py-1.5 text-sm bg-background"
          value={strVal}
          placeholder="Device/agent name"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

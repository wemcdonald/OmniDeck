import { useState, useEffect } from "react";
import { parseDuration, formatDuration, type DurationUnit } from "@omnideck/plugin-schema";
import type { CatalogField, PluginCatalog } from "../lib/api";
import EntityPicker from "./EntityPicker";
import EmojiPicker from "./EmojiPicker";
import MaterialSymbolsPicker from "./MaterialSymbolsPicker";
import ActionListEditor from "./ActionListEditor";
import AgentPicker from "./AgentPicker";
import ConditionEditor from "./ConditionEditor";

interface ParamFieldProps {
  field: CatalogField;
  value: unknown;
  onChange(value: unknown): void;
  catalog?: PluginCatalog;
  depth?: number;
}

/**
 * Returns a human error message if `value` violates `field`'s constraints,
 * or null if valid. Checks zod-extracted min/max; relies on ParamField's
 * fieldType-specific logic for unit parsing (handled where they're rendered).
 */
function validateBounds(field: CatalogField, value: number): string | null {
  if (!Number.isFinite(value)) return "Must be a number";
  if (field.min !== undefined && value < field.min) return `Must be ≥ ${field.min}`;
  if (field.max !== undefined && value > field.max) return `Must be ≤ ${field.max}`;
  return null;
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-[11px] text-destructive mt-1">{message}</p>;
}

// ── Duration field ──────────────────────────────────────────────────────────
// Stores a number in the unit declared by the schema (durationUnit); displays
// and parses human strings like "5s", "24h", "1h 30m". Shows inline parse/
// bounds errors but still emits onChange so the user sees Save-disabled state.

function DurationField({ field: f, value, onChange }: Omit<ParamFieldProps, "catalog" | "depth">) {
  const unit: DurationUnit = (f.durationUnit as DurationUnit | undefined) ?? "ms";
  const [text, setText] = useState(() =>
    typeof value === "number" ? formatDuration(value, unit) : String(value ?? ""),
  );
  const [error, setError] = useState<string | null>(null);

  // Re-sync if the schema default updates from the outside.
  useEffect(() => {
    if (typeof value === "number") {
      const formatted = formatDuration(value, unit);
      // Only overwrite if the displayed text can't round-trip to the same value
      // (avoids clobbering the user's partially-typed input on each keystroke).
      const parsed = parseDuration(text, unit);
      if (parsed !== value) setText(formatted);
    }
  }, [value, unit]); // eslint-disable-line react-hooks/exhaustive-deps

  const onInput = (next: string) => {
    setText(next);
    if (next.trim() === "") {
      setError(null);
      onChange(undefined);
      return;
    }
    const parsed = parseDuration(next, unit);
    if (parsed === null) {
      setError(`Invalid duration (try "5s", "1h 30m")`);
      return;
    }
    const bounds = validateBounds(f, parsed);
    if (bounds) {
      setError(bounds + ` (${unit})`);
      // Still emit so parent sees the live value; backend re-validates.
      onChange(parsed);
      return;
    }
    setError(null);
    onChange(parsed);
  };

  return (
    <>
      <input
        className="w-full rounded border px-2 py-1.5 text-sm bg-background"
        value={text}
        placeholder={f.placeholder ?? `e.g. 5s, 24h`}
        onChange={(e) => onInput(e.target.value)}
      />
      <FieldError message={error} />
    </>
  );
}

// ── Radio field ─────────────────────────────────────────────────────────────

function RadioField({ field: f, value, onChange }: Omit<ParamFieldProps, "catalog" | "depth">) {
  const options = f.enumValues ?? [];
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-sm">
          <input
            type="radio"
            name={f.key}
            value={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
          />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}

// ── Multi-select field ──────────────────────────────────────────────────────

function MultiSelectField({ field: f, value, onChange }: Omit<ParamFieldProps, "catalog" | "depth">) {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const options = f.enumValues ?? [];
  const toggle = (opt: string) => {
    if (selected.includes(opt)) onChange(selected.filter((v) => v !== opt));
    else onChange([...selected, opt]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`rounded border px-2 py-1 text-xs ${
              on ? "bg-primary text-primary-foreground border-primary" : "bg-background"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ── Slider field ────────────────────────────────────────────────────────────

function SliderField({ field: f, value, onChange }: Omit<ParamFieldProps, "catalog" | "depth">) {
  const min = f.min ?? 0;
  const max = f.max ?? 100;
  const step = f.step ?? 1;
  const num = typeof value === "number" ? value : Number(value);
  const current = Number.isFinite(num) ? num : min;
  const error = validateBounds(f, current);

  return (
    <>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className="w-20 rounded border px-2 py-1 text-sm bg-background"
        />
      </div>
      <FieldError message={error} />
    </>
  );
}

// ── Number field (shared) ───────────────────────────────────────────────────

function NumberField({ field: f, value, onChange }: Omit<ParamFieldProps, "catalog" | "depth">) {
  const num = typeof value === "number" ? value : Number(value);
  const hasValue = value !== undefined && value !== "" && Number.isFinite(num);
  const error = hasValue ? validateBounds(f, num) : null;
  return (
    <>
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
      <FieldError message={error} />
    </>
  );
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

      {/* Duration (parses human strings into the schema's numeric unit) */}
      {f.fieldType === "duration" && (
        <DurationField field={f} value={value} onChange={onChange} />
      )}

      {/* Radio (enum rendered as visible buttons) */}
      {f.fieldType === "radio" && f.enumValues && (
        <RadioField field={f} value={value} onChange={onChange} />
      )}

      {/* Multi-select (array of enum values) */}
      {f.fieldType === "multi_select" && f.enumValues && (
        <MultiSelectField field={f} value={value} onChange={onChange} />
      )}

      {/* Slider (number with range + readout) */}
      {f.fieldType === "slider" && (
        <SliderField field={f} value={value} onChange={onChange} />
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
        <NumberField field={f} value={value} onChange={onChange} />
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
        <AgentPicker value={strVal || undefined} onChange={(v) => onChange(v ?? "")} />
      )}
    </div>
  );
}

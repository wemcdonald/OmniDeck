import { z } from "zod";

// ── Field metadata ──────────────────────────────────────────────────────────

/** Symbol used to attach UI metadata to Zod schema nodes. */
export const FIELD_META = Symbol.for("omnideck.fieldMeta");

/** UI hints attached to a Zod schema node via field(). */
export interface FieldMeta {
  label: string;
  description?: string;
  /** Specialized field renderer. If omitted, inferred from the Zod type. */
  fieldType?:
    | "ha_entity"
    | "agent"
    | "page"
    | "icon"
    | "color"
    | "action_list"
    | "condition"
    | "radio"
    | "slider"
    | "duration"
    | "multi_select";
  /** For ha_entity: filter to a specific HA domain (e.g., "light"). */
  domain?: string;
  placeholder?: string;
  /** Visual grouping key in the editor (fields with the same group render together). */
  group?: string;
  secret?: boolean;
  /**
   * For fieldType="duration": what unit the underlying number is in.
   * Defaults to "ms". The UI displays/parses human strings ("5s", "24h") and
   * converts to/from this unit when posting to the backend.
   */
  durationUnit?: "ms" | "s" | "m" | "h";
  /** For fieldType="slider": step size. Defaults to 1. */
  step?: number;
}

/**
 * Attach UI metadata to a Zod schema node.
 *
 * ```ts
 * const schema = z.object({
 *   entity_id: field(z.string(), { label: "Entity", fieldType: "ha_entity" }),
 * });
 * ```
 */
export function field<T extends z.ZodType>(schema: T, meta: FieldMeta): T {
  (schema as any)[FIELD_META] = meta;
  return schema;
}

/** Read the FieldMeta attached to a Zod node (if any). */
export function getFieldMeta(schema: z.ZodType): FieldMeta | undefined {
  return (schema as any)[FIELD_META];
}

// ── Template variables ──────────────────────────────────────────────────────

/** A template variable exposed by a state provider for Mustache interpolation. */
export interface TemplateVariable {
  /** Variable key used in Mustache templates, e.g., "brightness_percent". */
  key: string;
  /** Human-readable label for the UI, e.g., "Brightness %". */
  label: string;
  /** Example value shown in the editor, e.g., "75". */
  example?: string;
}

// ── Catalog field (JSON-serializable) ───────────────────────────────────────

/** A single form field descriptor, serialized from a Zod schema for the catalog API. */
export interface CatalogField {
  key: string;
  zodType: "string" | "number" | "boolean" | "enum" | "array" | "object";
  required: boolean;
  default?: unknown;
  /** For enum types. */
  enumValues?: string[];
  /** From FieldMeta: */
  label: string;
  description?: string;
  fieldType?: string;
  domain?: string;
  placeholder?: string;
  group?: string;
  secret?: boolean;
  durationUnit?: "ms" | "s" | "m" | "h";
  /** From Zod checks (number type): */
  min?: number;
  max?: number;
  step?: number;
}

// ── Schema extraction ───────────────────────────────────────────────────────

/** Unwrap optional/default/nullable wrappers to get the inner Zod type. */
function unwrap(schema: z.ZodType): { inner: z.ZodType; required: boolean; defaultValue?: unknown } {
  let required = true;
  let defaultValue: unknown;
  let s = schema;

  // Peel layers
  for (;;) {
    if (s instanceof z.ZodOptional) {
      required = false;
      s = s.unwrap();
    } else if (s instanceof z.ZodDefault) {
      required = false;
      defaultValue = s._def.defaultValue();
      s = s._def.innerType;
    } else if (s instanceof z.ZodNullable) {
      required = false;
      s = s.unwrap();
    } else {
      break;
    }
  }

  return { inner: s, required, defaultValue };
}

/** Infer the zodType string from a (unwrapped) Zod schema. */
function inferZodType(schema: z.ZodType): CatalogField["zodType"] {
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodEnum || schema instanceof z.ZodNativeEnum) return "enum";
  if (schema instanceof z.ZodArray) return "array";
  return "object";
}

/** Extract min/max/step from a ZodNumber's checks. */
function extractNumberChecks(schema: z.ZodType): { min?: number; max?: number } {
  if (!(schema instanceof z.ZodNumber)) return {};
  const checks = schema._def.checks as Array<{ kind: string; value: number }>;
  let min: number | undefined;
  let max: number | undefined;
  for (const c of checks) {
    if (c.kind === "min") min = c.value;
    if (c.kind === "max") max = c.value;
  }
  return { min, max };
}

/** Extract enum values from a ZodEnum or a ZodArray<ZodEnum>. */
function extractEnumValues(schema: z.ZodType): string[] | undefined {
  if (schema instanceof z.ZodEnum) {
    return schema._def.values as string[];
  }
  if (schema instanceof z.ZodArray) {
    const inner = (schema._def as { type: z.ZodType }).type;
    if (inner instanceof z.ZodEnum) return inner._def.values as string[];
  }
  return undefined;
}

/**
 * Walk a `z.object(...)` schema and produce a `CatalogField[]` for the catalog API.
 *
 * Each top-level key in the object becomes one CatalogField. The field's UI hints
 * come from the `field()` metadata attached to the schema node. If no metadata is
 * attached, the field gets a label derived from its key name.
 */
export function extractFields(schema: z.ZodObject<any>): CatalogField[] {
  const shape = schema.shape as Record<string, z.ZodType>;
  const fields: CatalogField[] = [];

  for (const [key, raw] of Object.entries(shape)) {
    const { inner, required, defaultValue } = unwrap(raw);
    const meta = getFieldMeta(raw) ?? getFieldMeta(inner);
    const zodType = inferZodType(inner);
    const numChecks = extractNumberChecks(inner);
    const enumValues = extractEnumValues(inner);

    fields.push({
      key,
      zodType,
      required,
      default: defaultValue,
      enumValues,
      label: meta?.label ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      description: meta?.description,
      fieldType: meta?.fieldType,
      domain: meta?.domain,
      placeholder: meta?.placeholder,
      group: meta?.group,
      secret: meta?.secret,
      durationUnit: meta?.durationUnit,
      step: meta?.step,
      ...numChecks,
    });
  }

  return fields;
}

// ── Plugin health ───────────────────────────────────────────────────────────

/** Plugin configuration health status. */
export interface PluginHealth {
  status: "ok" | "misconfigured" | "error" | "degraded";
  message?: string;
  /** Which config key is problematic, e.g., "plugins.home-assistant.token". */
  configKey?: string;
  /** Frontend route to fix the issue, e.g., "/settings/plugins/home-assistant". */
  settingsUrl?: string;
}

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { field, getFieldMeta, extractFields } from "../field.js";

describe("field()", () => {
  it("attaches metadata to a Zod schema node", () => {
    const schema = field(z.string(), { label: "Entity", fieldType: "ha_entity" });
    const meta = getFieldMeta(schema);
    expect(meta).toEqual({ label: "Entity", fieldType: "ha_entity" });
  });

  it("returns the same schema (passthrough)", () => {
    const original = z.string();
    const decorated = field(original, { label: "Test" });
    expect(decorated).toBe(original);
  });

  it("returns undefined for schemas without metadata", () => {
    expect(getFieldMeta(z.string())).toBeUndefined();
  });
});

describe("extractFields()", () => {
  it("extracts basic string fields", () => {
    const schema = z.object({
      name: field(z.string(), { label: "Name", description: "User's name" }),
    });
    const fields = extractFields(schema);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      key: "name",
      zodType: "string",
      required: true,
      label: "Name",
      description: "User's name",
    });
  });

  it("extracts optional fields", () => {
    const schema = z.object({
      note: field(z.string().optional(), { label: "Note" }),
    });
    const fields = extractFields(schema);
    expect(fields[0].required).toBe(false);
  });

  it("extracts fields with defaults", () => {
    const schema = z.object({
      step: field(z.number().default(5), { label: "Step" }),
    });
    const fields = extractFields(schema);
    expect(fields[0].required).toBe(false);
    expect(fields[0].default).toBe(5);
    expect(fields[0].zodType).toBe("number");
  });

  it("extracts enum fields", () => {
    const schema = z.object({
      mode: field(z.enum(["sequential", "parallel"]), { label: "Mode" }),
    });
    const fields = extractFields(schema);
    expect(fields[0].zodType).toBe("enum");
    expect(fields[0].enumValues).toEqual(["sequential", "parallel"]);
  });

  it("extracts number min/max checks", () => {
    const schema = z.object({
      volume: field(z.number().min(0).max(100), { label: "Volume" }),
    });
    const fields = extractFields(schema);
    expect(fields[0].min).toBe(0);
    expect(fields[0].max).toBe(100);
  });

  it("extracts fieldType and domain from metadata", () => {
    const schema = z.object({
      entity_id: field(z.string(), {
        label: "Entity",
        fieldType: "ha_entity",
        domain: "light",
      }),
    });
    const fields = extractFields(schema);
    expect(fields[0].fieldType).toBe("ha_entity");
    expect(fields[0].domain).toBe("light");
  });

  it("generates label from key when no metadata", () => {
    const schema = z.object({
      entity_id: z.string(),
    });
    const fields = extractFields(schema);
    expect(fields[0].label).toBe("Entity Id");
  });

  it("reads metadata from inner schema when outer is optional", () => {
    const schema = z.object({
      target: field(z.string(), { label: "Target", fieldType: "agent" }).optional(),
    });
    const fields = extractFields(schema);
    expect(fields[0].label).toBe("Target");
    expect(fields[0].fieldType).toBe("agent");
    expect(fields[0].required).toBe(false);
  });

  it("handles boolean and array types", () => {
    const schema = z.object({
      enabled: field(z.boolean(), { label: "Enabled" }),
      tags: field(z.array(z.string()), { label: "Tags" }),
    });
    const fields = extractFields(schema);
    expect(fields[0].zodType).toBe("boolean");
    expect(fields[1].zodType).toBe("array");
  });

  it("handles multiple fields in order", () => {
    const schema = z.object({
      entity_id: field(z.string(), { label: "Entity", fieldType: "ha_entity" }),
      brightness: field(z.number().min(0).max(255).optional(), { label: "Brightness" }),
    });
    const fields = extractFields(schema);
    expect(fields).toHaveLength(2);
    expect(fields[0].key).toBe("entity_id");
    expect(fields[1].key).toBe("brightness");
    expect(fields[1].required).toBe(false);
  });
});

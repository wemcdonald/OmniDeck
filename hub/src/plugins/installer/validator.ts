import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  PluginManifestSchema,
  type PluginManifest,
} from "@omnideck/plugin-schema";
import { ZodError } from "zod";

export interface ValidationResult {
  valid: boolean;
  manifest?: PluginManifest;
  errors?: string[];
}

export function validatePluginDir(dir: string): ValidationResult {
  const manifestPath = join(dir, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    return { valid: false, errors: ["No manifest.yaml found"] };
  }

  const raw = readFileSync(manifestPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch {
    return { valid: false, errors: ["manifest.yaml is not valid YAML"] };
  }

  let manifest: PluginManifest;
  try {
    manifest = PluginManifestSchema.parse(parsed);
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        valid: false,
        errors: err.issues.map(
          (i) => `manifest.yaml: ${i.path.join(".")}: ${i.message}`,
        ),
      };
    }
    return { valid: false, errors: ["manifest.yaml validation failed"] };
  }

  const errors: string[] = [];

  if (manifest.hub && !existsSync(join(dir, manifest.hub))) {
    errors.push(
      `Manifest references hub file '${manifest.hub}' but it was not found`,
    );
  }

  if (manifest.agent && !existsSync(join(dir, manifest.agent))) {
    errors.push(
      `Manifest references agent file '${manifest.agent}' but it was not found`,
    );
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, manifest };
}

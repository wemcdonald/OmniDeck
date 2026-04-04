import { build } from "esbuild";
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface BundleResult {
  /** The bundled JavaScript code */
  code: string;
  /** SHA-256 hex digest of the code */
  sha256: string;
}

/**
 * Bundle a TypeScript hub plugin entry point to a plain ESM .mjs file.
 * Marks @omnideck/plugin-schema and zod as external so the hub's shared
 * instances are used (critical for the FIELD_META symbol to match).
 */
export async function bundleHubPlugin(
  entryPoint: string,
  outFile: string,
): Promise<void> {
  mkdirSync(dirname(outFile), { recursive: true });
  try {
    await build({
      entryPoints: [entryPoint],
      outfile: outFile,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "es2023",
      external: ["@omnideck/plugin-schema", "zod"],
      logLevel: "silent",
    });
  } catch {
    // Fallback: mark all packages external (plugin deps must live in hub node_modules)
    await build({
      entryPoints: [entryPoint],
      outfile: outFile,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "es2023",
      external: ["@omnideck/plugin-schema", "zod"],
      packages: "external",
      logLevel: "silent",
    });
  }
}

export async function bundleAgentPlugin(
  entryPoint: string,
): Promise<BundleResult> {
  let code: string;

  try {
    const result = await build({
      entryPoints: [entryPoint],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
      target: "es2023",
      // Agent SDK types are provided by the runtime, never bundled
      external: ["@omnideck/agent-sdk"],
      // Suppress warnings for missing deps in dev
      logLevel: "silent",
    });
    code = result.outputFiles[0].text;
  } catch {
    // If bundling fails (e.g. unresolved deps in dev/test), fall back to
    // bundling with all node_modules marked external so we still get output.
    const fallback = await build({
      entryPoints: [entryPoint],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
      target: "es2023",
      external: ["@omnideck/agent-sdk"],
      packages: "external",
      logLevel: "silent",
    });
    code = fallback.outputFiles[0].text;
  }

  const sha256 = createHash("sha256").update(code).digest("hex");
  return { code, sha256 };
}

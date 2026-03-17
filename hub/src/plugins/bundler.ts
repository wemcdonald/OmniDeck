import { build } from "esbuild";
import { createHash } from "node:crypto";

export interface BundleResult {
  /** The bundled JavaScript code */
  code: string;
  /** SHA-256 hex digest of the code */
  sha256: string;
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

import { z } from "zod";

const PlatformSchema = z.enum(["darwin", "windows", "linux"]);

export const PluginManifestSchema = z.object({
  /** Unique plugin ID (e.g., "bettertouchtool", "home-assistant") */
  id: z.string(),

  /** Human-readable name */
  name: z.string(),

  /** Semver version */
  version: z.string(),

  /** Which platforms the agent-side supports. Defaults to all. */
  platforms: z.array(PlatformSchema).default(["darwin", "windows", "linux"]),

  /** Hub-side entry point (always present) */
  hub: z.string(),

  /** Agent-side entry point (omit for hub-only plugins) */
  agent: z.string().optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/** What the Hub sends agents during init handshake */
export const PluginDistributionSchema = z.object({
  id: z.string(),
  version: z.string(),
  sha256: z.string(),
  platforms: z.array(PlatformSchema),
  hasAgent: z.boolean(),
});

export type PluginDistribution = z.infer<typeof PluginDistributionSchema>;

/** Agent → Hub: report plugin load results */
export const PluginStatusSchema = z.object({
  id: z.string(),
  version: z.string(),
  status: z.enum(["active", "failed"]),
  error: z.string().optional(),
});

export type PluginStatus = z.infer<typeof PluginStatusSchema>;

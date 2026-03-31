import { z } from "zod";

const PlatformSchema = z.enum(["darwin", "windows", "linux"]);

export const PluginManifestSchema = z.object({
  /** Unique plugin ID (e.g., "bettertouchtool", "home-assistant") */
  id: z.string(),

  /** Human-readable name */
  name: z.string(),

  /** Short description of what this plugin does */
  description: z.string().optional(),

  /** Semver version */
  version: z.string(),

  /** Which platforms the agent-side supports. Defaults to all. */
  platforms: z.array(PlatformSchema).default(["darwin", "windows", "linux"]),

  /** Hub-side entry point (omit for plugins with built-in hub logic) */
  hub: z.string().optional(),

  /** Agent-side entry point (omit for hub-only plugins) */
  agent: z.string().optional(),

  /** Downloadable assets (e.g., companion Chrome extensions) */
  downloads: z.array(z.object({
    /** URL-safe identifier for this download */
    name: z.string(),
    /** Human-readable label shown on the download button */
    label: z.string(),
    /** Relative path within the plugin directory (file or directory to zip) */
    path: z.string(),
    /** Description shown below the download button */
    description: z.string().optional(),
  })).optional(),
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

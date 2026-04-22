// Shared plugin icon registry. Plugins call ctx.registerIcon() during init;
// the renderer and the HTTP route both read from this module so a plugin
// icon can be addressed anywhere with "plugin:<id>/<name>".

export interface PluginIconAsset {
  /** Inline SVG source. Preferred — scales cleanly, tintable via currentColor. */
  svg?: string;
  /** Pre-rasterized PNG buffer. Used as-is (no tinting). */
  buffer?: Buffer;
  contentType: "image/svg+xml" | "image/png";
}

const registry = new Map<string, Map<string, PluginIconAsset>>();

export function registerPluginIcon(
  pluginId: string,
  name: string,
  asset: string | Buffer | PluginIconAsset,
): void {
  let inner = registry.get(pluginId);
  if (!inner) {
    inner = new Map();
    registry.set(pluginId, inner);
  }
  if (typeof asset === "string") {
    inner.set(name, { svg: asset, contentType: "image/svg+xml" });
  } else if (Buffer.isBuffer(asset)) {
    inner.set(name, { buffer: asset, contentType: "image/png" });
  } else {
    inner.set(name, asset);
  }
}

export function getPluginIcon(
  pluginId: string,
  name: string,
): PluginIconAsset | undefined {
  return registry.get(pluginId)?.get(name);
}

export function clearPluginIcons(pluginId: string): void {
  registry.delete(pluginId);
}

export function listPluginIcons(pluginId: string): string[] {
  const inner = registry.get(pluginId);
  return inner ? Array.from(inner.keys()) : [];
}

/** Parse "plugin:<id>/<name>" into its parts. Returns undefined for non-matches. */
export function parsePluginIconRef(
  ref: string,
): { pluginId: string; name: string } | undefined {
  if (!ref.startsWith("plugin:")) return undefined;
  const rest = ref.slice("plugin:".length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return undefined;
  return { pluginId: rest.slice(0, slash), name: rest.slice(slash + 1) };
}

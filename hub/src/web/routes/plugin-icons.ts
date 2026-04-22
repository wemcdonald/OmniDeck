import { Hono } from "hono";
import { getPluginIcon } from "../../plugins/icons.js";

export function createPluginIconRoutes(): Hono {
  const router = new Hono();

  router.get("/:pluginId/:name", (c) => {
    const { pluginId, name } = c.req.param();
    const asset = getPluginIcon(pluginId, decodeURIComponent(name));
    if (!asset) return c.notFound();

    c.header("Content-Type", asset.contentType);
    c.header("Cache-Control", "public, max-age=300");

    if (asset.svg) {
      // Optional ?color=... swaps currentColor so the SVG renders that tint
      // when used in an <img> tag (which can't inherit CSS color).
      const colorParam = c.req.query("color");
      const svg = colorParam
        ? asset.svg.replaceAll("currentColor", colorParam)
        : asset.svg;
      return c.body(svg);
    }
    if (asset.buffer) return c.body(asset.buffer as unknown as ArrayBuffer);
    return c.notFound();
  });

  return router;
}

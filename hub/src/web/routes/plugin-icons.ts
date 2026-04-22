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

    if (asset.svg) return c.body(asset.svg);
    if (asset.buffer) return c.body(asset.buffer as unknown as ArrayBuffer);
    return c.notFound();
  });

  return router;
}

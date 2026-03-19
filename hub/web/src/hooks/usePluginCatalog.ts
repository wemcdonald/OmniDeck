import { useState, useEffect, useCallback } from "react";
import { api, type PluginCatalog } from "../lib/api";

interface UsePluginCatalogResult {
  catalog: PluginCatalog | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Cached catalog — shared across all hook instances in the same session. */
let cachedCatalog: PluginCatalog | null = null;
let fetchPromise: Promise<PluginCatalog> | null = null;

export function usePluginCatalog(): UsePluginCatalogResult {
  const [catalog, setCatalog] = useState<PluginCatalog | null>(cachedCatalog);
  const [loading, setLoading] = useState(!cachedCatalog);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((force = false) => {
    if (cachedCatalog && !force) {
      setCatalog(cachedCatalog);
      setLoading(false);
      return;
    }

    // Deduplicate concurrent fetches
    if (!fetchPromise || force) {
      setLoading(true);
      setError(null);
      fetchPromise = api.status.pluginCatalog();
    }

    fetchPromise
      .then((data) => {
        cachedCatalog = data;
        setCatalog(data);
        setLoading(false);
        fetchPromise = null;
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
        fetchPromise = null;
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { catalog, loading, error, refresh };
}

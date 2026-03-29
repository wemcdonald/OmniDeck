import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type PluginCatalog } from "../lib/api";
import { useCallback } from "react";

interface UsePluginCatalogResult {
  catalog: PluginCatalog | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePluginCatalog(): UsePluginCatalogResult {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["pluginCatalog"],
    queryFn: api.status.pluginCatalog,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["pluginCatalog"] });
  }, [queryClient]);

  return {
    catalog: data ?? null,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    refresh,
  };
}

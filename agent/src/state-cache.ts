/**
 * Caches the last value a plugin emitted for each (pluginId, key) pair so that
 * the agent can replay state to a hub whenever a connection (re)opens without
 * every plugin having to implement its own re-push logic.
 */
export class StateCache {
  private byPlugin = new Map<string, Map<string, unknown>>();

  set(pluginId: string, key: string, value: unknown): void {
    let keyed = this.byPlugin.get(pluginId);
    if (!keyed) {
      keyed = new Map();
      this.byPlugin.set(pluginId, keyed);
    }
    keyed.set(key, value);
  }

  /** Evict all entries for a plugin (e.g. on unload). */
  clearPlugin(pluginId: string): void {
    this.byPlugin.delete(pluginId);
  }

  clearAll(): void {
    this.byPlugin.clear();
  }

  /** Yields every cached entry as (pluginId, key, value) triples. */
  *entries(): IterableIterator<[string, string, unknown]> {
    for (const [pluginId, keyed] of this.byPlugin) {
      for (const [key, value] of keyed) {
        yield [pluginId, key, value];
      }
    }
  }

  size(): number {
    let total = 0;
    for (const keyed of this.byPlugin.values()) total += keyed.size;
    return total;
  }
}

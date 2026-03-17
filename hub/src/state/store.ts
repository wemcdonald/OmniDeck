// hub/src/state/store.ts
type ChangeCallback = (pluginId: string, key: string, value: unknown) => void;

export class StateStore {
  private data = new Map<string, Map<string, unknown>>();
  private listeners: ChangeCallback[] = [];
  private batching = false;
  private pendingChanges: Array<[string, string, unknown]> = [];

  set(pluginId: string, key: string, value: unknown): void {
    let pluginState = this.data.get(pluginId);
    if (!pluginState) {
      pluginState = new Map();
      this.data.set(pluginId, pluginState);
    }
    pluginState.set(key, value);

    if (this.batching) {
      this.pendingChanges.push([pluginId, key, value]);
    } else {
      this.notify(pluginId, key, value);
    }
  }

  get(pluginId: string, key: string): unknown {
    return this.data.get(pluginId)?.get(key);
  }

  getAll(pluginId: string): Map<string, unknown> {
    return this.data.get(pluginId) ?? new Map();
  }

  onChange(cb: ChangeCallback): void {
    this.listeners.push(cb);
  }

  batch(fn: () => void): void {
    this.batching = true;
    this.pendingChanges = [];
    try {
      fn();
    } finally {
      this.batching = false;
      for (const [pluginId, key, value] of this.pendingChanges) {
        this.notify(pluginId, key, value);
      }
      this.pendingChanges = [];
    }
  }

  private notify(pluginId: string, key: string, value: unknown): void {
    for (const cb of this.listeners) {
      cb(pluginId, key, value);
    }
  }
}

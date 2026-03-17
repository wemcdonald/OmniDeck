import type { OmniDeck, ActionResult, IntervalHandle, OmniDeckLogger } from "@omnideck/agent-sdk";
import { execCommand } from "../primitives/exec.js";
import { detectPlatform } from "../primitives/platform.js";
import { createLogger } from "../logger.js";

type ActionHandler = (params: Record<string, unknown>) => Promise<ActionResult>;

export interface PluginRuntime {
  id: string;
  actions: Map<string, ActionHandler>;
  destroy(): Promise<void>;
  reloadConfig(newConfig: Record<string, unknown>): void;
  pushState(key: string, value: unknown): void;
}

interface RuntimeOptions {
  pluginId: string;
  config: Record<string, unknown>;
  hostname: string;
  onStateUpdate: (pluginId: string, key: string, value: unknown) => void;
}

export function createPluginRuntime(opts: RuntimeOptions): { omnideck: OmniDeck; runtime: PluginRuntime } {
  const log = createLogger(`plugin:${opts.pluginId}`);
  const actions = new Map<string, ActionHandler>();
  const intervals: Array<ReturnType<typeof setInterval>> = [];
  const destroyCallbacks: Array<() => void | Promise<void>> = [];
  let reloadConfigHandler: ((config: Record<string, unknown>) => void) | undefined;
  let currentConfig = { ...opts.config };

  const pluginLog: OmniDeckLogger = {
    info: (msg, data) => log.info(msg, data),
    warn: (msg, data) => log.warn(msg, data),
    error: (msg, data) => log.error(msg, data),
  };

  const omnideck: OmniDeck = {
    get config() {
      return currentConfig;
    },

    onReloadConfig(handler) {
      reloadConfigHandler = handler;
    },

    onAction(actionId, handler) {
      actions.set(actionId, handler);
    },

    setState(key, value) {
      opts.onStateUpdate(opts.pluginId, key, value);
    },

    async exec(command, args) {
      return execCommand(command, args ?? []);
    },

    get platform() {
      return detectPlatform();
    },

    get hostname() {
      return opts.hostname;
    },

    setInterval(fn, ms) {
      const handle = setInterval(() => {
        Promise.resolve(fn()).catch((err) => {
          log.error("Plugin interval error", { err: String(err) });
        });
      }, ms);
      intervals.push(handle);
      return Symbol() as IntervalHandle;
    },

    clearInterval(_handle) {
      // Individual handle tracking omitted; onDestroy clears all intervals.
    },

    get log() {
      return pluginLog;
    },

    onDestroy(fn) {
      destroyCallbacks.push(fn);
    },
  };

  const runtime: PluginRuntime = {
    id: opts.pluginId,
    actions,
    async destroy() {
      for (const interval of intervals) clearInterval(interval);
      intervals.length = 0;
      for (const cb of destroyCallbacks) await cb();
      destroyCallbacks.length = 0;
    },
    reloadConfig(newConfig) {
      currentConfig = { ...newConfig };
      reloadConfigHandler?.(currentConfig);
    },
    pushState(key, value) {
      opts.onStateUpdate(opts.pluginId, key, value);
    },
  };

  return { omnideck, runtime };
}

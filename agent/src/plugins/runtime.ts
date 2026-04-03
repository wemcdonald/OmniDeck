import type { OmniDeck, ActionResult, IntervalHandle, OmniDeckLogger } from "@omnideck/agent-sdk";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execCommand } from "../primitives/exec.js";
import { detectPlatform } from "../primitives/platform.js";
import { ensureFfi, openLibrary } from "../primitives/ffi.js";
import { getConfigDir } from "../config-dir.js";
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
  onLog?: (pluginId: string, level: string, msg: string, data?: Record<string, unknown>) => void;
  platformRequest?: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  onActiveUpdate?: (pluginId: string, active: boolean, metadata?: Record<string, unknown>) => void;
}

export function createPluginRuntime(opts: RuntimeOptions): { omnideck: OmniDeck; runtime: PluginRuntime } {
  const log = createLogger(`plugin:${opts.pluginId}`);
  const actions = new Map<string, ActionHandler>();
  const intervalMap = new Map<IntervalHandle, ReturnType<typeof setInterval>>();
  const destroyCallbacks: Array<() => void | Promise<void>> = [];
  let reloadConfigHandler: ((config: Record<string, unknown>) => void) | undefined;
  let currentConfig = { ...opts.config };

  const pluginLog: OmniDeckLogger = {
    info: (msg, data) => { log.info(msg, data); opts.onLog?.(opts.pluginId, "info", msg, data); },
    warn: (msg, data) => { log.warn(msg, data); opts.onLog?.(opts.pluginId, "warn", msg, data); },
    error: (msg, data) => { log.error(msg, data); opts.onLog?.(opts.pluginId, "error", msg, data); },
  };

  // Ensure per-plugin data directory exists
  const dataDir = join(getConfigDir(), "data", opts.pluginId);
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

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

    get ffi() {
      return {
        open(path: string, symbols: Record<string, import("@omnideck/agent-sdk").FfiSymbol>) {
          return openLibrary(path, symbols);
        },
      };
    },

    get platform() {
      return detectPlatform();
    },

    get dataDir() {
      return dataDir;
    },

    get hostname() {
      return opts.hostname;
    },

    setInterval(fn, ms) {
      const handle = Symbol() as IntervalHandle;
      const timer = setInterval(() => {
        Promise.resolve(fn()).catch((err) => {
          log.error("Plugin interval error", { err: String(err) });
        });
      }, ms);
      intervalMap.set(handle, timer);
      return handle;
    },

    clearInterval(handle) {
      const timer = intervalMap.get(handle);
      if (timer !== undefined) {
        clearInterval(timer);
        intervalMap.delete(handle);
      }
    },

    get log() {
      return pluginLog;
    },

    async platformRequest(method, params) {
      if (!opts.platformRequest) {
        throw new Error("platformRequest is not available (not running in managed mode)");
      }
      return opts.platformRequest(method, params);
    },

    onDestroy(fn) {
      destroyCallbacks.push(fn);
    },

    setActive(active, metadata) {
      opts.onActiveUpdate?.(opts.pluginId, active, metadata);
    },
  };

  const runtime: PluginRuntime = {
    id: opts.pluginId,
    actions,
    async destroy() {
      for (const timer of intervalMap.values()) clearInterval(timer);
      intervalMap.clear();
      for (const cb of destroyCallbacks) {
        try {
          await cb();
        } catch (err) {
          log.error("Plugin destroy callback error", { err: String(err) });
        }
      }
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

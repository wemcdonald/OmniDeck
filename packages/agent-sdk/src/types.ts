// packages/agent-sdk/src/types.ts
import type { z } from "zod";

/** Result returned from an action handler */
export interface ActionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/** Result of exec() calls */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Handle for managed intervals */
export type IntervalHandle = symbol;

/** FFI type identifiers for native library calls */
export type FfiType = "void" | "bool" | "i8" | "i16" | "i32" | "i64"
  | "u8" | "u16" | "u32" | "u64" | "f32" | "f64" | "ptr";

/** Describes a native function signature */
export interface FfiSymbol {
  args: FfiType[];
  returns: FfiType;
}

/** Handle to an opened native library */
export interface FfiLibrary {
  /** Call a loaded symbol. */
  call(name: string, ...args: unknown[]): unknown;
  /** Close the library handle. */
  close(): void;
}

/** Logger interface */
export interface OmniDeckLogger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

/** The omnideck object injected into agent plugin init() */
export interface OmniDeck {
  /** Plugin config from Hub YAML/DB. Read-only snapshot. */
  readonly config: Record<string, unknown>;

  /** Called when user changes plugin config via Hub. */
  onReloadConfig(handler: (newConfig: Record<string, unknown>) => void): void;

  /** Register a handler for actions triggered by Hub (button presses, etc.) */
  onAction(
    actionId: string,
    handler: (params: Record<string, unknown>) => Promise<ActionResult>,
  ): void;

  /** Push state to Hub (fire-and-forget). Hub merges into state store. */
  setState(key: string, value: unknown): void;

  /** Run a shell command. Uses platform-appropriate shell. */
  exec(command: string, args?: string[]): Promise<ExecResult>;

  /** Open a native library via FFI. Uses Bun's FFI under the hood. */
  readonly ffi: {
    open(path: string, symbols: Record<string, FfiSymbol>): FfiLibrary;
  };

  /** Current platform */
  readonly platform: "darwin" | "windows" | "linux";

  /** Per-plugin persistent data directory (for caching compiled helpers, etc.) */
  readonly dataDir: string;

  /** Agent hostname */
  readonly hostname: string;

  /** Managed interval — automatically cleared on plugin unload/reload */
  setInterval(fn: () => void | Promise<void>, ms: number): IntervalHandle;
  clearInterval(handle: IntervalHandle): void;

  /** Logging — forwarded to Hub */
  readonly log: OmniDeckLogger;

  /**
   * Send a request to the host process (Tauri app) for operations that
   * require elevated permissions (e.g., Accessibility on macOS).
   *
   * Available methods:
   * - `send_keystroke` — Post a CGEvent keyboard event (macOS). Params: `{ keyCode: number, flags: number }`
   * - `run_applescript` — Execute an AppleScript string (macOS). Params: `{ script: string }`
   *
   * Returns the host's response, or throws if the host doesn't support the method.
   */
  platformRequest(method: string, params: Record<string, unknown>): Promise<unknown>;

  /** Register cleanup function called on plugin unload/reload */
  onDestroy(fn: () => void | Promise<void>): void;
}

/** The function signature every agent plugin must default-export */
export type AgentPluginInit = (omnideck: OmniDeck) => void | Promise<void>;

// Ensure zod import is used for type-only enforcement in plugin config schemas
export type { z };

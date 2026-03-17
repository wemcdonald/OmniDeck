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

  /** Current platform */
  readonly platform: "darwin" | "windows" | "linux";

  /** Agent hostname */
  readonly hostname: string;

  /** Managed interval — automatically cleared on plugin unload/reload */
  setInterval(fn: () => void | Promise<void>, ms: number): IntervalHandle;
  clearInterval(handle: IntervalHandle): void;

  /** Logging — forwarded to Hub */
  readonly log: OmniDeckLogger;

  /** Register cleanup function called on plugin unload/reload */
  onDestroy(fn: () => void | Promise<void>): void;
}

/** The function signature every agent plugin must default-export */
export type AgentPluginInit = (omnideck: OmniDeck) => void | Promise<void>;

// Ensure zod import is used for type-only enforcement in plugin config schemas
export type { z };

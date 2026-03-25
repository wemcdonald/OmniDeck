// hub/src/modes/engine.ts — ModeEngine: subscribes to StateStore, evaluates mode rules

import type { StateStore } from "../state/store.js";
import type { ModeDefinition, ModeAction, ModeChangeCallback, ModeHistoryEntry } from "./types.js";
import { evaluateRule, debugRule, type StateResolver, type ModeEvalResult } from "./evaluator.js";
import { createLogger } from "../logger.js";

const log = createLogger("modes");

export interface ModeEngineDeps {
  store: StateStore;
  /** Resolve a state provider by qualified ID. */
  resolveState: StateResolver;
  /** Execute a qualified action (e.g. "home-assistant.scene_activate"). */
  executeAction: (qualifiedId: string, params: Record<string, unknown>) => Promise<void>;
}

export class ModeEngine {
  private modes: ModeDefinition[];
  private deps: ModeEngineDeps;
  private _active: ModeDefinition | null = null;
  private changeCbs: ModeChangeCallback[] = [];
  private started = false;
  private evaluating = false;
  private _history: ModeHistoryEntry[] = [];
  private static readonly MAX_HISTORY = 50;

  constructor(modes: ModeDefinition[], deps: ModeEngineDeps) {
    // Sort by priority (lower = higher priority) for consistent evaluation
    this.modes = [...modes].sort((a, b) => a.priority - b.priority);
    this.deps = deps;
  }

  /** The currently active mode, or null if none match. */
  get active(): ModeDefinition | null {
    return this._active;
  }

  /** The currently active mode ID, or null. */
  get activeId(): string | null {
    return this._active?.id ?? null;
  }

  /** Register a callback for mode changes. */
  onModeChange(cb: ModeChangeCallback): void {
    this.changeCbs.push(cb);
  }

  /** Start listening to state changes. Performs an initial evaluation. */
  start(): void {
    if (this.started) return;
    this.started = true;

    this.deps.store.onChange(() => {
      this.evaluate();
    });

    // Initial evaluation
    this.evaluate();
  }

  /** Get all mode definitions (for debug/status API). */
  get definitions(): readonly ModeDefinition[] {
    return this.modes;
  }

  /** Get mode transition history (most recent first). */
  get history(): readonly ModeHistoryEntry[] {
    return this._history;
  }

  /**
   * Evaluate all modes and return detailed debug info per check.
   * Used by the live preview UI to show why each rule passes/fails.
   */
  debugEvaluate(): ModeEvalResult[] {
    const resolve = this.deps.resolveState;
    return this.modes.map((mode) => {
      const rules = mode.rules.map((rule) => debugRule(rule, resolve));
      const active = rules.some((r) => r.passes);
      return {
        id: mode.id,
        name: mode.name,
        priority: mode.priority,
        rules,
        active,
      };
    });
  }

  /** Stop the engine. Does not unsubscribe from store (store has no removeListener). */
  stop(): void {
    this.started = false;
  }

  /**
   * Re-evaluate all modes against current state.
   * Fires on_exit/on_enter actions and callbacks if the active mode changes.
   */
  evaluate(): void {
    if (!this.started || this.evaluating) return;
    this.evaluating = true;

    const resolve = this.deps.resolveState;
    let matched: ModeDefinition | null = null;

    // Check for manual override
    const override = this.deps.store.get("omnideck-core", "mode_override") as string | null;
    if (override) {
      matched = this.modes.find((m) => m.id === override) ?? null;
    } else {
      // Modes are pre-sorted by priority. First match wins.
      for (const mode of this.modes) {
        // Top-level OR: any rule matching = mode is active
        const active = mode.rules.some((rule) => evaluateRule(rule, resolve));
        if (active) {
          matched = mode;
          break;
        }
      }
    }

    // If same mode, nothing to do
    if (matched?.id === this._active?.id) {
      this.evaluating = false;
      return;
    }

    const prev = this._active;
    this._active = matched;

    log.info(
      { from: prev?.id ?? null, to: matched?.id ?? null },
      `Mode changed: ${prev?.id ?? "none"} → ${matched?.id ?? "none"}`,
    );

    // Write to state store (batched to coalesce into a single notification)
    this.deps.store.batch(() => {
      this.deps.store.set("omnideck-core", "active_mode", matched?.id ?? null);
      this.deps.store.set("omnideck-core", "active_mode_name", matched?.name ?? null);
      this.deps.store.set("omnideck-core", "active_mode_icon", matched?.icon ?? null);
    });

    // Record in history
    this._history.unshift({
      from: prev?.id ?? null,
      to: matched?.id ?? null,
      timestamp: new Date().toISOString(),
    });
    if (this._history.length > ModeEngine.MAX_HISTORY) {
      this._history.length = ModeEngine.MAX_HISTORY;
    }

    this.evaluating = false;

    // Fire callbacks
    for (const cb of this.changeCbs) {
      try {
        cb(prev, matched);
      } catch (err) {
        log.error({ err }, "Mode change callback error");
      }
    }

    // Fire on_exit for previous mode, then on_enter for new mode
    this.fireTransition(prev, matched);
  }

  private fireTransition(
    prev: ModeDefinition | null,
    next: ModeDefinition | null,
  ): void {
    const run = async () => {
      if (prev?.onExit) {
        await this.fireActions(prev.onExit);
      }
      if (next?.onEnter) {
        await this.fireActions(next.onEnter);
      }
    };
    run().catch((err) => log.error({ err }, "Mode transition action error"));
  }

  private async fireActions(actions: ModeAction[]): Promise<void> {
    for (const action of actions) {
      if (action.switch_page) {
        await this.deps.executeAction("omnideck-core.change_page", {
          page: action.switch_page,
        });
      }
      if (action.trigger_action) {
        await this.deps.executeAction(
          action.trigger_action,
          action.params ?? {},
        );
      }
    }
  }
}

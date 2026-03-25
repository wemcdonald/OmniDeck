// hub/src/modes/evaluator.ts — Pure evaluation functions for mode rules

import type { ModeCheck, ModeRule } from "./types.js";

/**
 * Result of resolving a state provider for a mode check.
 * Mirrors the shape returned by PluginHost.resolveState().
 */
export interface ResolvedState {
  state: Record<string, unknown>;
  variables: Record<string, string>;
}

export type StateResolver = (
  qualifiedId: string,
  params: unknown,
) => ResolvedState | undefined;

/**
 * Evaluate a single comparator against a value.
 * Returns true if the check passes.
 */
export function compareValue(
  actual: unknown,
  check: ModeCheck,
): boolean {
  if (check.equals !== undefined) {
    return actual === check.equals || String(actual) === String(check.equals);
  }
  if (check.not_equals !== undefined) {
    return actual !== check.not_equals && String(actual) !== String(check.not_equals);
  }
  if (check.in !== undefined) {
    return check.in.some((v) => actual === v || String(actual) === String(v));
  }
  if (check.not_in !== undefined) {
    return !check.not_in.some((v) => actual === v || String(actual) === String(v));
  }
  if (check.greater_than !== undefined) {
    return Number(actual) > check.greater_than;
  }
  if (check.less_than !== undefined) {
    return Number(actual) < check.less_than;
  }
  if (check.contains !== undefined) {
    return typeof actual === "string" && actual.includes(check.contains);
  }
  if (check.matches !== undefined) {
    try {
      return typeof actual === "string" && new RegExp(check.matches).test(actual);
    } catch {
      return false;
    }
  }
  // No comparator specified — fail
  return false;
}

/**
 * Extract the attribute value from resolved state.
 * Looks in variables first (template vars), then in state.
 */
export function extractAttribute(
  resolved: ResolvedState,
  attribute: string,
): unknown {
  if (attribute in resolved.variables) {
    return resolved.variables[attribute];
  }
  if (attribute in resolved.state) {
    return resolved.state[attribute];
  }
  return undefined;
}

/**
 * Evaluate a single check against a state resolver.
 */
export function evaluateCheck(
  check: ModeCheck,
  resolve: StateResolver,
): boolean {
  const resolved = resolve(check.provider, check.params ?? {});
  if (!resolved) return false;
  const actual = extractAttribute(resolved, check.attribute);
  return compareValue(actual, check);
}

/**
 * Evaluate a rule (a group of checks combined with and/or).
 */
export function evaluateRule(
  rule: ModeRule,
  resolve: StateResolver,
): boolean {
  if (rule.checks.length === 0) return false;

  if (rule.condition === "and") {
    return rule.checks.every((check) => evaluateCheck(check, resolve));
  }
  // "or"
  return rule.checks.some((check) => evaluateCheck(check, resolve));
}

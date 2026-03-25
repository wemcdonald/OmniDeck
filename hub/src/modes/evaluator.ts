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

// ── Debug evaluation (returns detailed results per check) ─────────────

export interface CheckResult {
  provider: string;
  attribute: string;
  actualValue: unknown;
  comparator: string;
  expectedValue: unknown;
  passes: boolean;
  providerFound: boolean;
}

export interface RuleResult {
  condition: "and" | "or";
  checks: CheckResult[];
  passes: boolean;
}

export interface ModeEvalResult {
  id: string;
  name: string;
  priority: number;
  rules: RuleResult[];
  active: boolean;
}

function getComparatorInfo(check: ModeCheck): { comparator: string; expected: unknown } {
  if (check.equals !== undefined) return { comparator: "equals", expected: check.equals };
  if (check.not_equals !== undefined) return { comparator: "not_equals", expected: check.not_equals };
  if (check.in !== undefined) return { comparator: "in", expected: check.in };
  if (check.not_in !== undefined) return { comparator: "not_in", expected: check.not_in };
  if (check.greater_than !== undefined) return { comparator: "greater_than", expected: check.greater_than };
  if (check.less_than !== undefined) return { comparator: "less_than", expected: check.less_than };
  if (check.contains !== undefined) return { comparator: "contains", expected: check.contains };
  if (check.matches !== undefined) return { comparator: "matches", expected: check.matches };
  return { comparator: "none", expected: undefined };
}

/**
 * Evaluate a single check and return detailed debug info.
 */
export function debugCheck(check: ModeCheck, resolve: StateResolver): CheckResult {
  const resolved = resolve(check.provider, check.params ?? {});
  const providerFound = resolved !== undefined;
  const actual = resolved ? extractAttribute(resolved, check.attribute) : undefined;
  const passes = providerFound ? compareValue(actual, check) : false;
  const { comparator, expected } = getComparatorInfo(check);

  return {
    provider: check.provider,
    attribute: check.attribute,
    actualValue: actual,
    comparator,
    expectedValue: expected,
    passes,
    providerFound,
  };
}

/**
 * Evaluate a rule and return detailed debug info for each check.
 */
export function debugRule(rule: ModeRule, resolve: StateResolver): RuleResult {
  const checks = rule.checks.map((c) => debugCheck(c, resolve));
  const passes =
    rule.checks.length === 0
      ? false
      : rule.condition === "and"
        ? checks.every((c) => c.passes)
        : checks.some((c) => c.passes);

  return { condition: rule.condition, checks, passes };
}

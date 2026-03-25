// hub/src/modes/types.ts — Mode system type definitions

export interface ModeDefinition {
  id: string;
  name: string;
  icon?: string;
  /** Lower wins when multiple modes match. Default: 50 */
  priority: number;
  /** Top-level OR: any rule matching = mode is active */
  rules: ModeRule[];
  onEnter?: ModeAction[];
  onExit?: ModeAction[];
}

export interface ModeRule {
  /** How to combine the checks within this rule */
  condition: "and" | "or";
  checks: ModeCheck[];
}

export interface ModeCheck {
  /** Qualified state provider ID, e.g. "os-control.active_window" */
  provider: string;
  /** Params passed to the state provider's resolve() */
  params?: Record<string, unknown>;
  /** Which attribute of the resolved state/variables to test */
  attribute: string;
  /** Scope to a specific agent */
  target?: string;

  // Exactly one comparator:
  equals?: string | number | boolean;
  not_equals?: string | number | boolean;
  in?: (string | number)[];
  not_in?: (string | number)[];
  greater_than?: number;
  less_than?: number;
  contains?: string;
  matches?: string;
}

export interface ModeAction {
  /** Shorthand for core.switch_page */
  switch_page?: string;
  /** Qualified action ID */
  trigger_action?: string;
  /** Params for the triggered action */
  params?: Record<string, unknown>;
}

export type ModeChangeCallback = (
  from: ModeDefinition | null,
  to: ModeDefinition | null,
) => void;

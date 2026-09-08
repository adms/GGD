/**
 * UISchema IR — the hand-rolled Zod field-walker's output. Nodes carry a
 * SCHEMA path ("effects[].amount.flat", "[]" marks array items); the renderer
 * threads concrete DATA paths ("effects.0.amount.flat") at render time so
 * Zod/server field errors map straight onto widgets.
 */

export interface UIBase {
  /** schema path (uiHints + tests match against this) */
  path: string;
  label: string;
  optional: boolean;
  description?: string;
}

export interface UIText extends UIBase {
  kind: "text";
  ref?: { target: string; soft: boolean };
}

export interface UINumber extends UIBase {
  kind: "number";
  int: boolean;
  min?: number;
  max?: number;
  /**
   * The bound is EXCLUSIVE — zod's `.positive()` / `.gt()` / `.lt()`.
   *
   * Carried separately because `.positive()` records itself as
   * `{kind:"min", value:0, inclusive:false}`, and a walker that keeps only
   * `value` turns "must be > 0" into "may be 0". `defaultValueFor` then seeds
   * the widget with 0, the form looks filled in, and the SAVE is what fails —
   * the shipping schema rejects it with a 422. That is exactly how
   * `damageArea.radius`, `dash.speed/maxDistance` and `leap.durationSec`
   * behaved before task-#210's variant was audited; see walk.test.ts.
   */
  exclusiveMin?: boolean;
  exclusiveMax?: boolean;
}

export interface UIBoolean extends UIBase {
  kind: "boolean";
}

/** A constrained numeric value or one explicit string sentinel, e.g. 3 | all. */
export interface UINumberOrLiteral extends UIBase {
  kind: "numberOrLiteral";
  number: UINumber;
  literal: string;
}

/** One scalar for all ranks, or explicit numeric columns. */
export interface UINumberOrArray extends UIBase {
  kind: "numberOrArray";
  number: UINumber;
  item: UINumber;
  minItems: number;
  maxItems?: number;
}

export interface UIEnum extends UIBase {
  kind: "enum";
  options: (string | number)[];
}

export interface UILiteral extends UIBase {
  kind: "literal";
  value: string | number | boolean;
}

export interface UIArray extends UIBase {
  kind: "array";
  item: UINode;
}

export interface UITuple extends UIBase {
  kind: "tuple";
  items: UINode[];
}

export interface UIObject extends UIBase {
  kind: "object";
  fields: UINode[];
}

export interface UIRecord extends UIBase {
  kind: "record";
  value: UINode;
}

export interface UIDiscriminatedUnion extends UIBase {
  kind: "discriminatedUnion";
  discriminator: string;
  variants: { tag: string; fields: UINode[] }[];
}

/** Fallback: raw JSON textarea (unions we can't model, depth-capped recursion). */
export interface UIUnknown extends UIBase {
  kind: "unknown";
}

/** Bounded visual editor for the shared recursive effect-condition contract. */
export interface UICondition extends UIBase {
  kind: "condition";
}

export type UINode =
  | UIText
  | UINumber
  | UINumberOrLiteral
  | UINumberOrArray
  | UIBoolean
  | UIEnum
  | UILiteral
  | UIArray
  | UITuple
  | UIObject
  | UIRecord
  | UIDiscriminatedUnion
  | UICondition
  | UIUnknown;

/** "buildPriority" -> "Build Priority" */
export function humanize(key: string): string {
  if (!key) return "";
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_.]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

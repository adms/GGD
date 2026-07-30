/**
 * `condition@1` — the Zod mirror of `sim/content/condition.ts`'s
 * {@link EffectCondition}, i.e. the AUTHORING surface of the 觸發條件 system.
 *
 * TWO THINGS THIS FILE IS RESPONSIBLE FOR THAT A PLAIN MIRROR WOULD NOT BE:
 *
 * 1. ⭐ IT IS WHERE 「percent 只在有分母的屬性上開放」 IS *ENFORCED*, NOT DESCRIBED.
 *    `zStatLeaf` is a UNION of two shapes — the resource shape (hp/mp) which
 *    accepts `mode:"percent"`, and the plain shape whose `mode` is the literal
 *    "absolute" — so `{stat:"attackSpeed", mode:"percent"}` is a PARSE ERROR at
 *    content-load time and a red field in the console. A single object with a
 *    free `mode` plus a comment saying 「攻速沒有百分比」 would have been a
 *    comment, and comments lie (CLAUDE.md 第三守則).
 *
 * 2. ⭐ IT BOUNDS BOTH ENDS OF EVERY NUMBER. `value` is range-checked AGAINST
 *    THE MODE — a percent is a 0..1 ratio, an absolute is 0..1e6 — which is the
 *    only reason 「35」 typed where 「0.35」 was meant fails loudly instead of
 *    becoming a gate that is true for every living body. (`validateField` before
 *    2026-07-29 checked only `min`; this schema is what stops that class of bug
 *    reaching the sim.)
 *
 * DEPTH IS CAPPED, AND WITH A REAL WALK RATHER THAN A LAZY-RECURSION LIMIT.
 * `z.lazy` recursion has no natural floor, and an unbounded tree would reach the
 * evaluator, the describer AND the editor's renderer. {@link zEffectCondition}
 * therefore parses recursively and then runs ONE `superRefine` over the parsed
 * value that rejects anything past `CONDITION_MAX_DEPTH`, reusing
 * `conditionDepth` from the sim module so the two cannot drift.
 */
import { z } from "zod";
import {
  CONDITION_ABSOLUTE_MAX,
  CONDITION_ABSOLUTE_MIN,
  CONDITION_CHANCE_MAX,
  CONDITION_CHANCE_MIN,
  CONDITION_ENTITY_KINDS,
  CONDITION_MAX_CHILDREN,
  CONDITION_MAX_DEPTH,
  CONDITION_PERCENT_MAX,
  CONDITION_PERCENT_MIN,
  COMPARE_OPS,
  PLAIN_STATS,
  RESOURCE_STATS,
  conditionDepth,
  type EffectCondition,
} from "../../sim/content/condition";

/** Turn a readonly string list into the non-empty tuple `z.enum` demands. */
function enumOf<T extends string>(values: readonly T[]): z.ZodEnum<[T, ...T[]]> {
  return z.enum([values[0]!, ...values.slice(1)] as [T, ...T[]]);
}

export const zConditionSubject = z.enum(["self", "target"]);
export const zCompareOp = enumOf(COMPARE_OPS);
export const zResourceStat = enumOf(RESOURCE_STATS);
export const zPlainStat = enumOf(PLAIN_STATS);
export const zConditionEntityKind = enumOf(CONDITION_ENTITY_KINDS);

/**
 * 機率 leaf. `p` is a RATIO like every other probability in the codebase
 * (`HookDef.chance`, `Stat.CritChance`, `Stat.Lifesteal`), so 0.01 is the 獸矛
 * hero-execute roll and 1 is 「一定」.
 */
export const zChanceLeaf = z
  .object({
    kind: z.literal("chance"),
    p: z.number().min(CONDITION_CHANCE_MIN).max(CONDITION_CHANCE_MAX),
  })
  .strict();

/** hp/mp — the only two stats with a maximum, so the only two offering `percent`. */
export const zResourceStatLeaf = z
  .object({
    kind: z.literal("stat"),
    subject: zConditionSubject,
    stat: zResourceStat,
    mode: z.enum(["absolute", "percent"]),
    op: zCompareOp,
    value: z.number(),
  })
  .strict()
  .superRefine((leaf, ctx) => {
    const [lo, hi] =
      leaf.mode === "percent"
        ? [CONDITION_PERCENT_MIN, CONDITION_PERCENT_MAX]
        : [CONDITION_ABSOLUTE_MIN, CONDITION_ABSOLUTE_MAX];
    if (leaf.value < lo || leaf.value > hi) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message:
          leaf.mode === "percent"
            ? `百分比是 0..1 的比例（35% 要寫 0.35），收到 ${leaf.value}`
            : `絕對值必須在 ${lo}..${hi} 之間，收到 ${leaf.value}`,
      });
    }
  });

/**
 * Everything else. `mode` is the LITERAL "absolute" (optional) — that literal is
 * the enforcement of DECISION 3, and the reason a `percent` on 攻速 cannot be
 * authored at all rather than being silently reinterpreted.
 */
export const zPlainStatLeaf = z
  .object({
    kind: z.literal("stat"),
    subject: zConditionSubject,
    stat: zPlainStat,
    mode: z.literal("absolute").optional(),
    op: zCompareOp,
    value: z.number().min(CONDITION_ABSOLUTE_MIN).max(CONDITION_ABSOLUTE_MAX),
  })
  .strict();

export const zStatLeaf = z.union([zResourceStatLeaf, zPlainStatLeaf]);

/** 「目標不是英雄」 is `not` of this — every kind test is POSITIVE (DECISION 2). */
export const zKindLeaf = z
  .object({
    kind: z.literal("kind"),
    subject: zConditionSubject,
    is: zConditionEntityKind,
  })
  .strict();

export const zConditionLeaf = z.union([zChanceLeaf, zStatLeaf, zKindLeaf]);

/**
 * The recursive tree. `.min(1)` on both group arrays is load-bearing: an empty
 * `all` is vacuously TRUE and an empty `any` vacuously FALSE, and either one is
 * a card that silently stopped meaning what its author thought — exactly the
 * 「內容刪掉時測試不是失敗，是根本不存在」 shape. Making it unauthorable is
 * cheaper than detecting it later.
 */
const zConditionInner: z.ZodType<EffectCondition> = z.lazy(() =>
  z.union([
    zConditionLeaf,
    z.object({ all: z.array(zConditionInner).min(1).max(CONDITION_MAX_CHILDREN) }).strict(),
    z.object({ any: z.array(zConditionInner).min(1).max(CONDITION_MAX_CHILDREN) }).strict(),
    z.object({ not: zConditionInner }).strict(),
  ]),
);

/**
 * The authorable condition. Depth-capped — see the header for why the cap is a
 * post-parse walk rather than a recursion limit.
 */
export const zEffectCondition: z.ZodType<EffectCondition> = zConditionInner.superRefine(
  (cond, ctx) => {
    const d = conditionDepth(cond);
    if (d > CONDITION_MAX_DEPTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `條件巢狀深度 ${d} 超過上限 ${CONDITION_MAX_DEPTH}`,
      });
    }
  },
);

/**
 * The champion ROLE TAXONOMY (task #47 follow-up).
 *
 * WHY SIX. The imported roster collapsed every hero to fighter (79, melee) or
 * marksman (32, ranged) — `role` was a verbatim duplicate of `attackType` and
 * carried no information. These six are not invented here: they are exactly
 * the keys `ROLE_WEIGHTS` already carries in
 * packages/shared/src/sim/stats/rating.ts, which grades a match on nine
 * sub-scores weighted PER ROLE. The grader has been asking for this taxonomy
 * since it was written; the content tree just never supplied it.
 *
 * `fighter` is deliberately NOT in the list. rating.ts keeps a `fighter` weight
 * vector as a legacy fallback, but as a content value it is the degenerate
 * catch-all this whole exercise exists to remove — a melee damage dealer is a
 * bruiser (durable, sustained) or an assassin (fragile, burst), and forcing the
 * call is the point.
 *
 * ORTHOGONAL TO attackType. `attackType: melee|ranged` stays a separate field
 * and keeps describing the basic attack. Only `marksman` implies ranged (a
 * marksman IS its auto-attack); every other role is reachable from both.
 */
export const ROLES = ["tank", "bruiser", "assassin", "mage", "marksman", "support"] as const;

export type Role = (typeof ROLES)[number];

/** One-line gloss per role — printed in the report legend, shown as UI chips. */
export const ROLE_BLURB: Record<Role, string> = {
  tank: "前排：高血量/護甲，減傷或控場，輸出低",
  bruiser: "戰士：續戰型近戰，血量與輸出兼具",
  assassin: "刺客：脆皮爆發，位移或隱形，追擊單殺",
  mage: "法師：智力係數技能傷害，魔力池大，爆發或牽制",
  marksman: "射手：遠程普攻輸出，攻速與敏捷成長",
  support: "輔助：治療/護盾/淨化/光環，隊友向技能",
};

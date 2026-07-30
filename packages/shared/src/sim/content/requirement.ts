/**
 * 職業限定閘 (class requirement) — 「這個效果，這位英雄吃不吃得到」, in ONE place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT EXISTS
 *
 * owner 2026-07-30 asked for four legendary FAMILIES that are each meaningless
 * on the wrong body: 「例如近戰專用擴散、法師保命、坦克衝刺、射手百分比傷害」.
 * A cleave that fires on a champion who attacks from 9 units away, or a
 * mage-survival shield on a champion with 6 base INT, is not a balance問題 —
 * it is a lie printed on the card.
 *
 * `item@1` had NO role condition of any kind. `requiresAttackType` (#189)
 * exists but it gates the OFFER — whether the card may be dealt — and its own
 * header says so: 「Nothing re-checks `requiresAttackType` after the item is in
 * a slot」. That is the right rule for a whole weapon and the WRONG one for a
 * single clause, because the four families above are one clause on a weapon
 * whose stat block everybody should keep.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHICH AXES, AND WHY NOT `role` — MEASURED ON THE LIVE ROSTER, NOT ASSUMED
 *
 * `ChampionDef.role` is the obvious candidate and it is USELESS as a gate.
 * voxelSkin/generate.ts records it as 「a pure function of `attackType` — 79
 * fighter / 32 marksman and three singletons」, and that was re-measured here
 * over content/champions/*.json (119 docs): `role` carries no information that
 * `attackType` does not already carry. Keying a gate off it would produce
 * exactly two buckets wearing four names.
 *
 * The two axes that DO separate the owner's four families, counted over the
 * same 119 docs:
 *
 *              STR      AGI      INT
 *   melee       45       32        6        (83 melee)
 *   ranged       5        8       23        (36 ranged)
 *
 *   · `attackType`  — melee 83 / ranged 36. Splits 近戰擴散 from 射手.
 *   · `primaryStat` — STR 50 / AGI 40 / INT 29, read off `attributes.primary`
 *     (the 三圍 recovered in #248). Splits 坦克 (STR) from 法師 (INT).
 *
 * Every one of the six cells has real population, so a two-axis requirement can
 * express 「近戰坦克」 (melee+STR, 45) as tightly as 「法師」 (INT, 29) without
 * naming an empty set. A THIRD axis (`tags`) is deliberately NOT implemented:
 * champion `tags` are w3x-import debris, not curated roles, and a gate keyed to
 * them would look configurable while silently matching nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION — UNKNOWN PASSES, ALWAYS.
 *
 * A champion with no doc, no ChampionComp, or (pre-#248 / skeleton content) no
 * `attributes` block resolves to `null` on that axis, and `null` SATISFIES every
 * requirement. Copied deliberately from `offerEligibility.championAttackType`,
 * for its stated reason: a restriction is a statement about CONTENT, and it must
 * never become a silent way to hand a test harness — or a mob, or a summon — an
 * inert weapon. Failing open makes a mis-authored gate visible as "it always
 * fires"; failing closed makes it invisible as "it never fires", which is
 * failure mode ② wearing a config field.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION — EVALUATED AT FIRE TIME, AGAINST THE HOOK'S OWNER.
 *
 * {@link satisfiesRequirement} is called from `effects/hooks.ts`, per hook, per
 * fire — not once at attach time. Two consequences, both wanted:
 *
 *   1. a 變身 (#249 `setBody` rewrites `ChampionComp.championId`) re-evaluates
 *      the gate on the very next hook, so a form that changes attackType changes
 *      what its weapons do. Caching at attach time would have frozen the answer
 *      to whatever body happened to be equipped in the shop.
 *   2. an AURA-projected hook is owned by the RECIPIENT, because `auraSystem`
 *      attaches the payload as a source on the ally standing inside and
 *      `fireHooks(world, owner)` walks THAT unit's sources. So the same field
 *      spells 「周圍的近戰友軍」 with no aura-side machinery at all — which is
 *      exactly what 惡魔吉他 (godie-i02k) needs.
 *
 * PURITY: pure reads of world components + the content registry. No rng, no
 * clock, no Math.* — safe under sim/purity.test.ts.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { PrimaryAttr } from "../stats/attributes";
import type { EffectDef, Scaling } from "../effects/effect";
import { Champions } from "./registry";

/**
 * WHAT the carrier must be for a gated clause to pay out. Every field is
 * optional and an omitted field is NOT a constraint, so `{}` means "everybody"
 * and the whole object being absent means the same — every pre-existing hook is
 * therefore untouched by construction.
 */
export interface ClassRequirement {
  /** 近戰 / 遠程. Absent = either. */
  attackType?: "melee" | "ranged";
  /** 主屬性 力/敏/智, read off the champion's `attributes.primary` (#248). */
  primaryStat?: PrimaryAttr;
  /**
   * WHAT HAPPENS TO A CARRIER WHO DOES NOT QUALIFY — the decision point, made a
   * field instead of a hard-coded rule (CLAUDE.md 第一守則:「拿不定主意的決策，
   * 解法是兩種模式都做，後台可切」).
   *
   *   · "block"   (DEFAULT) the clause does not fire at all. Chosen as the
   *               default because it is the one a player can read off the card:
   *               「近戰專用」 means it does nothing for you.
   *   · "reduced" the clause fires at {@link mismatchScale} strength — the
   *               「效果減半」 option, for when a hard no feels too punishing.
   *
   * DEFAULTED IN ONE PLACE (`resolveRequirement`), so an authored doc that omits
   * it and a doc that writes "block" take the identical code path.
   */
  onMismatch?: "block" | "reduced";
  /**
   * Strength multiplier applied when `onMismatch: "reduced"` and the carrier
   * does not qualify. 0.5 = 「效果減半」, the owner's phrasing, and the default.
   *
   * BOUNDED ON BOTH SIDES (CLAUDE.md:「欄位要有上界，不是只有下界」). The upper
   * bound is 1 because this is a PENALTY knob: a value above 1 would make
   * failing the requirement STRONGER than passing it, which is not a balance
   * choice, it is a typo (0.5 entered as 5). The lower bound is 0, which is
   * legal and means "scaled to nothing".
   *
   * ⚠️ CORRECTED 2026-07-30 (稽核 / CLAUDE.md 第三守則). This paragraph used to
   * claim that `mismatchScale: 0` 「still fires the proc, still burns the
   * internal cooldown and still emits its events, so the two are genuinely
   * different mechanics」. **THAT IS NOT WHAT THE CODE DOES.**
   * `requirementScale` returns 0 for BOTH "block" and "reduced"+0, and
   * `effects/hooks.ts` bails out on `if (scale === 0) continue;` *before* the
   * internal-cooldown gate and before the proc roll. So today
   * `onMismatch:"reduced", mismatchScale:0` is byte-identical to
   * `onMismatch:"block"` — no ICD burned, no rng draw, no event.
   * If the distinction described above is actually wanted, it is a CODE change
   * (let 0 through the ICD/roll and scale the payload to nothing), not a
   * comment. Until then treat 0 as a synonym for "block".
   *
   * IGNORED under "block". Authoring it there is harmless but pointless; the
   * schema does not forbid it because the admin form keeps both fields visible
   * while the operator flips the mode back and forth.
   */
  mismatchScale?: number;
}

/** Hard bounds for `mismatchScale`, shared with the Zod schema so they cannot drift. */
export const MISMATCH_SCALE_MIN = 0;
export const MISMATCH_SCALE_MAX = 1;
/** Applied when `onMismatch: "reduced"` and no scale was authored — 「效果減半」. */
export const DEFAULT_MISMATCH_SCALE = 0.5;

/**
 * This entity's attack type, or `null` when it is not a champion / its doc is
 * not registered. `null` = unknown = passes every gate (see the header).
 *
 * Reads `ChampionComp.championId` rather than a spawn-time snapshot, so a 變身
 * is reflected immediately.
 */
export function carrierAttackType(world: SimWorld, id: EntityId): "melee" | "ranged" | null {
  const champ = world.champion.get(id);
  if (!champ) return null;
  return Champions.tryGet(champ.championId)?.attackType ?? null;
}

/**
 * This entity's 主屬性, or `null` when it is not a champion / has no doc / the
 * doc predates #248 and carries no `attributes` block.
 */
export function carrierPrimaryStat(world: SimWorld, id: EntityId): PrimaryAttr | null {
  const champ = world.champion.get(id);
  if (!champ) return null;
  return Champions.tryGet(champ.championId)?.attributes?.primary ?? null;
}

/** Does `id` satisfy every axis `req` names? An absent axis is not a constraint. */
export function satisfiesRequirement(
  world: SimWorld,
  id: EntityId,
  req: ClassRequirement | undefined,
): boolean {
  if (req === undefined) return true;
  if (req.attackType !== undefined) {
    const have = carrierAttackType(world, id);
    if (have !== null && have !== req.attackType) return false;
  }
  if (req.primaryStat !== undefined) {
    const have = carrierPrimaryStat(world, id);
    if (have !== null && have !== req.primaryStat) return false;
  }
  return true;
}

/**
 * The payout multiplier for `id` under `req`: 1 when it qualifies (or there is
 * no requirement), else 0 for "block" and the clamped `mismatchScale` for
 * "reduced". Returning a NUMBER rather than a boolean is what lets the two
 * modes share one code path at the call site.
 */
export function requirementScale(
  world: SimWorld,
  id: EntityId,
  req: ClassRequirement | undefined,
): number {
  if (satisfiesRequirement(world, id, req)) return 1;
  if (req?.onMismatch !== "reduced") return 0; // "block" and the absent default
  const raw = req.mismatchScale ?? DEFAULT_MISMATCH_SCALE;
  return raw < MISMATCH_SCALE_MIN
    ? MISMATCH_SCALE_MIN
    : raw > MISMATCH_SCALE_MAX
      ? MISMATCH_SCALE_MAX
      : raw;
}

// ---------------------------------------------------------------------------
// SCALING A PAYLOAD DOWN — the "reduced" half
// ---------------------------------------------------------------------------

function scaleScaling(s: Scaling, k: number): Scaling {
  const out: Scaling = {};
  if (s.flat !== undefined) out.flat = s.flat * k;
  if (s.perRank !== undefined) out.perRank = s.perRank.map((v) => v * k);
  if (s.ratios !== undefined) out.ratios = s.ratios.map((r) => ({ stat: r.stat, coeff: r.coeff * k }));
  return out;
}

/**
 * A COPY of `effects` with every MAGNITUDE multiplied by `k`, for the "reduced"
 * mismatch mode. Never mutates its input — the array it is handed is the
 * authored content doc, shared by every carrier of the item, and scaling it in
 * place would permanently weaken the weapon for everybody who qualifies.
 *
 * WHAT IS SCALED, AND WHAT IS DELIBERATELY NOT.
 *
 * Scaled: `damage` / `damageArea` amounts, `heal`, `shield` (amount AND
 * duration), and the DURATION of `applyStatus` / `applyBuff`. Those are the
 * kinds where "half" has an unambiguous meaning.
 *
 * NOT scaled, and this is a decision rather than an omission:
 *   · `applyStatus.root` / `.stun` — a boolean. There is no half of a stun; the
 *     duration carries the reduction instead, which is what WC3's own hero-vs-
 *     unit stun-resistance does.
 *   · `applyBuff.modifiers` — a StatModifier list whose ops include `mult` and
 *     `override`, where halving the VALUE is not halving the EFFECT (`mult` 2.0
 *     halved is 1.0, i.e. cancelled entirely; `override` halved is a different
 *     override, not a weaker one). Silently getting this wrong would be worse
 *     than not doing it.
 *   · `dash` / `leap` / `championForm` / `spawnProjectile` / `summon` — movement
 *     and structural kinds. Half a dash is a different ability.
 *
 * A kind with nothing scalable passes through UNCHANGED (identity), never
 * throws: `reduced` mode is authored on the requirement, not per effect, so a
 * list that happens to contain a structural kind must not detonate.
 *
 * ⚠️ Consequence worth stating plainly: authoring `onMismatch: "reduced"` on a
 * clause whose whole payload is an un-scalable kind gives the mismatching
 * carrier the FULL effect. The guard in `requirement.test.ts` asserts the
 * scalable kinds really change; nothing can assert intent for the rest.
 */
export function scaleEffects(effects: readonly EffectDef[], k: number): EffectDef[] {
  if (k === 1) return effects as EffectDef[];
  return effects.map((e): EffectDef => {
    switch (e.kind) {
      case "damage":
        return { ...e, amount: scaleScaling(e.amount, k) };
      case "damageArea":
        return { ...e, amount: scaleScaling(e.amount, k) };
      case "heal":
        return { ...e, amount: scaleScaling(e.amount, k) };
      case "shield":
        return { ...e, amount: scaleScaling(e.amount, k), duration: e.duration * k };
      case "applyStatus":
        return { ...e, duration: e.duration * k };
      case "applyBuff":
        return { ...e, duration: e.duration * k };
      default:
        return e;
    }
  });
}

// ---------------------------------------------------------------------------
// THE VISIBLE HALF — 「閘一定要看得見」
// ---------------------------------------------------------------------------

const ATTACK_TYPE_LABEL: Record<"melee" | "ranged", string> = {
  melee: "近戰",
  ranged: "遠程",
};

const PRIMARY_LABEL: Record<PrimaryAttr, string> = {
  STR: "力量",
  AGI: "敏捷",
  INT: "智力",
};

/**
 * The human sentence for a requirement — 「限近戰·力量英雄」 — or `null` when the
 * requirement constrains nothing.
 *
 * THIS IS NOT DECORATION. A player who sees a legendary he cannot use, with no
 * stated reason, is worse off than a player who never saw it: he learns the
 * wrong lesson about the item. So the condition text is DERIVED from the same
 * object the sim gates on, in shared code, rather than typed into each doc's
 * `description` by hand — a hand-typed condition is a comment, and comments lie
 * (CLAUDE.md 第三守則). Change the gate and the sentence changes with it.
 *
 * The mismatch mode is part of the sentence, because 「不能用」 and 「只有一半
 * 效果」 are different purchases.
 */
export function describeRequirement(req: ClassRequirement | undefined): string | null {
  if (req === undefined) return null;
  const parts: string[] = [];
  if (req.attackType !== undefined) parts.push(ATTACK_TYPE_LABEL[req.attackType]);
  if (req.primaryStat !== undefined) parts.push(PRIMARY_LABEL[req.primaryStat]);
  if (parts.length === 0) return null;
  const who = parts.join("·");
  if (req.onMismatch === "reduced") {
    const pct = Math.round((req.mismatchScale ?? DEFAULT_MISMATCH_SCALE) * 100);
    return `限${who}英雄（其他英雄僅 ${pct}% 效果）`;
  }
  return `限${who}英雄（其他英雄無效）`;
}

/**
 * Every distinct requirement sentence an item carries, in authored order,
 * de-duplicated — what a shop card / tooltip prints under the name.
 *
 * Structural parameter type so ONE function serves both sides of the content
 * boundary: the loaded `ItemDoc` and the registered `ItemDef`.
 */
export function itemRequirementLabels(def: {
  passive?: readonly { requires?: ClassRequirement }[];
  auras?: readonly { hooks?: readonly { requires?: ClassRequirement }[] }[];
}): string[] {
  const out: string[] = [];
  const push = (r: ClassRequirement | undefined): void => {
    const s = describeRequirement(r);
    if (s !== null && !out.includes(s)) out.push(s);
  };
  for (const h of def.passive ?? []) push(h.requires);
  for (const a of def.auras ?? []) for (const h of a.hooks ?? []) push(h.requires);
  return out;
}

/** Does this item gate ANY of its clauses? Drives the shop card's badge. */
export function itemHasRequirement(def: {
  passive?: readonly { requires?: ClassRequirement }[];
  auras?: readonly { hooks?: readonly { requires?: ClassRequirement }[] }[];
}): boolean {
  return itemRequirementLabels(def).length > 0;
}

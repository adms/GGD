/**
 * 觸發條件 (on-attack by condition) — 「這一下，這個效果到底該不該發生」, in ONE
 * place, as DATA the editor can build from dropdowns.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT EXISTS — a real card the old model could only LIE about
 *
 * owner 2026-07-30:「`>= < =` 某個常數或某個數值條件，最常見是我方或敵人的屬性、
 * HP/MP 數值或百分比 … 當然機率也是 condition，甚至可以組合技」.
 *
 * The driving case is 蒼月潮 07-002 獸矛持有者, whose own shipped description says
 * 「在攻擊非英雄部隊時，當該部隊血量低於35%將直接死亡，並有1%機率造成英雄直接
 * 死亡」. Before this file the only vocabulary a proc had was `HookDef.chance` — a
 * bare probability — so the template card had to approximate an EXECUTE as
 * 「12.5% 機率造成 100 傷害」. That is not a weaker version of the ability, it is a
 * different ability, and owner said so plainly: 看不懂也不合理.
 *
 * With a condition the same card is honest, and it needs all four of the axes
 * owner listed AT ONCE:
 *
 *   any: [ all: [ 目標不是英雄, 目標生命 < 35% ],      ← 比較運算子 + 百分比
 *          all: [ 目標是英雄,   1% 機率      ] ]        ← 機率也是 condition
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT IS A SEPARATE FILE FROM `requirement.ts` AND NOT A SECOND COPY OF IT
 *
 * `ClassRequirement` (the 職業限定閘) answers 「這張卡，這位英雄配不配得上」 — a
 * question about the CARRIER and about CONTENT CURATION, whose answer barely
 * changes during a match and whose mismatch mode is 「不能用 / 只有一半效果」.
 * A condition answers 「這一次，這一下」 — a question about the MOMENT, re-asked
 * on every single swing, whose answer is a plain yes/no.
 *
 * They compose rather than compete: `fireHooks` evaluates `requires` first (it
 * is the cheaper, rng-free, carrier-level gate) and only then this. Folding the
 * two into one union would have made the class gate re-derivable per-swing and
 * the moment gate carry a `mismatchScale` that means nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ DECISION 1 — `chance` IS DRAWN UP FRONT, AND THE TREE DOES NOT SHORT-CIRCUIT
 *
 * THIS IS THE DETERMINISM DECISION OF THE WHOLE FILE. Read it before touching
 * {@link evaluateCondition}.
 *
 * A tree may contain several `chance` leaves. If evaluation short-circuited —
 * `all: [A, B]` skipping B once A is false — then HOW MANY DRAWS the world's
 * single shared `Rng` gives up on a given tick would depend on WORLD STATE (the
 * target's hp, whether the target is a hero, …) and on the AUTHORED ORDER of the
 * clauses. Two replicas that disagree about one hp value by one packet would
 * then desync their entire rng stream from that tick on, and the failure would
 * surface somewhere else entirely — a different crit, a different mob spawn.
 *
 * So evaluation is TWO PHASES:
 *
 *   1. {@link drawChances} walks the tree in a fixed PRE-ORDER (`all`/`any`
 *      children in authored array order; `not`'s single child) and draws exactly
 *      one `world.rng.chance(p)` per `chance` leaf, into a flat array.
 *   2. {@link evalNode} walks the SAME pre-order, consuming that array with a
 *      cursor, and DELIBERATELY DOES NOT SHORT-CIRCUIT: every child of an `all`
 *      is evaluated even after one is false, every child of an `any` even after
 *      one is true. It has to, or the cursor and the draw order would disagree.
 *
 * The invariant this buys, and the one `conditionRng.test.ts` pins:
 *
 *     the number of rng draws a condition consumes is a pure function of the
 *     CONDITION TREE'S SHAPE — never of the world, the target, or the outcome.
 *
 * The cost is honest and small: a `chance` leaf behind a gate that is false
 * still consumes a draw. That cost buys a stream position that can be reasoned
 * about from the doc alone. Phase 2 is pure — no rng — so re-evaluating a tree
 * with the same draws always gives the same answer.
 *
 * ⚠️ NOT CONFIGURABLE, on purpose, and this is the one place in the system where
 * 「決策點做成後台欄位」 does NOT apply: a toggle between the two orders would
 * silently invalidate every replay recorded under the other setting, so the knob
 * would not be a design choice, it would be a way to corrupt saved matches.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ DECISION 2 — AN UNREADABLE LEAF IS FALSE (and `not` therefore flips it)
 *
 * `subject: "target"` on an event that carries no entity (an `onLevelUp` hook, a
 * `target: "self"` proc), a stat on a body that has no StatsComp, an hp percent
 * on a body whose maxHp is 0 — every one of these resolves to FALSE, never to
 * "skip" and never to "pass".
 *
 * This is the OPPOSITE of `requirement.ts`'s 「unknown passes」, and deliberately.
 * A class requirement is a statement about CONTENT that must not silently hand a
 * test harness an inert weapon, so it fails OPEN. A condition is a statement
 * about a MOMENT, and 「這一刻的目標血量低於 35%」 when there is no target at all
 * is not true — answering yes would fire an execute into the void. Failing
 * closed also makes a mis-authored condition visible the loud way (「它從來不
 * 觸發」) rather than the quiet way (「它每次都觸發」), which for a DAMAGE gate is
 * the safer direction.
 *
 * Consequence worth stating plainly, because it is the one thing that surprises:
 * `not(目標是英雄)` with NO target is TRUE. Two-valued logic has no third answer
 * and inventing an "unknown" that poisons every enclosing `not` would make the
 * dropdown UI unexplainable. Authors who need 「有目標而且不是英雄」 write
 * `all: [ 目標是小兵 ]` — every `kind` leaf is a POSITIVE test.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ DECISION 3 — `percent` ONLY EXISTS WHERE IT HAS A DENOMINATOR
 *
 * 「生命 < 35%」 has an obvious meaning: current / max. 「攻速 < 35%」 has none —
 * there is no maximum attack speed a champion is a fraction of. So `percent` is
 * offered on {@link RESOURCE_STATS} (hp, mp) and NOWHERE else, and that
 * restriction is expressed in the TYPE and in the Zod schema
 * (`content/schema/condition.ts`), not in a comment: `{stat:"ad", mode:"percent"}`
 * does not compile and does not parse. The editor's mode dropdown is driven off
 * {@link statSupportsPercent} for the same reason — one source, three surfaces.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PURITY: pure reads of world components + the content registry, plus `Rng`
 * draws in phase 1 only. No clock, no Math.random, no trig, no `**` — safe under
 * sim/purity.test.ts.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { Stat } from "../stats/statTypes";
import type { AttrKey } from "../stats/attributes";
import { liveAttribute } from "../stats/attrSources";

// ---------------------------------------------------------------------------
// THE VOCABULARY
// ---------------------------------------------------------------------------

/** WHOSE number/kind a leaf reads. 「我方或敵人」 in owner's phrasing. */
export type ConditionSubject = "self" | "target";
export const CONDITION_SUBJECTS: readonly ConditionSubject[] = ["self", "target"];

/**
 * The two stats that HAVE a maximum, and therefore the only two on which
 * `mode: "percent"` means anything (DECISION 3).
 */
export type ResourceStat = "hp" | "mp";
export const RESOURCE_STATS: readonly ResourceStat[] = ["hp", "mp"];

/**
 * Everything else a condition may compare — absolute values only.
 *
 * `str`/`agi`/`int` are the 三圍 recovered in #248 and are read LIVE
 * (`championAttribute` including the points bought this match, #260), not off
 * the doc, so 「敏捷 >= 40」 responds to the shop. The six combat stats are read
 * off `StatsComp.final`, i.e. the post-pipeline, post-combat-env, post-clamp
 * number — THE SAME NUMBER THE PLAYER'S PANEL SHOWS (#125). A condition that
 * compared a pre-multiplier base would be a second, invisible stat model.
 */
export type PlainStat =
  | "str"
  | "agi"
  | "int"
  | "ad"
  | "ap"
  | "armor"
  | "magicResist"
  | "moveSpeed"
  | "attackSpeed"
  | "level";
export const PLAIN_STATS: readonly PlainStat[] = [
  "str",
  "agi",
  "int",
  "ad",
  "ap",
  "armor",
  "magicResist",
  "moveSpeed",
  "attackSpeed",
  "level",
];

export type ConditionStat = ResourceStat | PlainStat;
/** Editor dropdown order: the two resources first, they are the common case. */
export const CONDITION_STATS: readonly ConditionStat[] = [...RESOURCE_STATS, ...PLAIN_STATS];

/**
 * Does `stat` admit `mode: "percent"`? The ONE answer the type, the schema and
 * the UI share (DECISION 3).
 *
 * It is a TYPE PREDICATE rather than a plain boolean so the editor's
 * 「switch stat → repair mode」 branch narrows for free: without the predicate
 * that code has to cast, and a cast is exactly how 「攻速 percent」 would sneak
 * back past the type system into a doc that then fails Zod at save time.
 */
export function statSupportsPercent(stat: ConditionStat): stat is ResourceStat {
  return (RESOURCE_STATS as readonly string[]).includes(stat);
}

/** owner:「`>= < =` 某個常數」 — plus the two he implied by writing 「某個數值條件」. */
export type CompareOp = ">=" | "<=" | ">" | "<" | "==" | "!=";
export const COMPARE_OPS: readonly CompareOp[] = [">=", "<=", ">", "<", "==", "!="];

/**
 * WHAT a body is. Four positive tests; a body that is none of them (a flower, a
 * coin, a bare test entity) matches none — the same honest reading `HookDef.victim`
 * takes, and the reason there is no `"other"` member to invert against.
 */
export type ConditionEntityKind = "champion" | "mob" | "summon" | "guardian";
export const CONDITION_ENTITY_KINDS: readonly ConditionEntityKind[] = [
  "champion",
  "mob",
  "summon",
  "guardian",
];

/**
 * BOUNDS. 「欄位要有上界，不是只有下界」 — `validateField` used to check only
 * `min`, so 0.35 typed as 35 sailed through the console and was silently
 * meaningless downstream.
 *
 * `percent` is a RATIO, exactly like `chance` and like `Stat.Lifesteal`: 0.35 is
 * 35%. The [0,1] ceiling is what turns 「35」 into a form error instead of a
 * condition that is true for every living body.
 *
 * `absolute` has no principled ceiling — 「生命 >= 4000」 is a normal late-game
 * gate — so 1e6 is a MIS-PARSE guard in the spirit of `zAuraDef.radius`'s 40: it
 * catches a raw un-converted number that leaked in from somewhere, not a balance
 * choice. The floor is 0 because every stat in {@link ConditionStat} is
 * non-negative by construction, so a negative bound could only ever be a typo.
 */
export const CONDITION_PERCENT_MIN = 0;
export const CONDITION_PERCENT_MAX = 1;
export const CONDITION_ABSOLUTE_MIN = 0;
export const CONDITION_ABSOLUTE_MAX = 1_000_000;
export const CONDITION_CHANCE_MIN = 0;
export const CONDITION_CHANCE_MAX = 1;

/**
 * How deep a tree may nest, and how many children one group may hold. Both are
 * structural sanity limits rather than design limits (the 獸矛 gate — the most
 * complex real card known — is depth 3 with 2+2 children), and both exist so a
 * hand-edited or machine-generated doc cannot hand the evaluator, the describer
 * or the editor an unbounded recursion.
 */
export const CONDITION_MAX_DEPTH = 5;
export const CONDITION_MAX_CHILDREN = 8;

// ---------------------------------------------------------------------------
// THE SHAPE
// ---------------------------------------------------------------------------

/** 機率 — owner:「當然機率也是 condition」. Drawn in phase 1; see DECISION 1. */
export interface ChanceLeaf {
  kind: "chance";
  /** 0..1. 0.01 = the 獸矛 hero-execute roll. */
  p: number;
}

/** A number comparison on a body that HAS a maximum, so `percent` is offered. */
export interface ResourceStatLeaf {
  kind: "stat";
  subject: ConditionSubject;
  stat: ResourceStat;
  /** "percent" = current/max as a 0..1 ratio; "absolute" = the raw number. */
  mode: "absolute" | "percent";
  op: CompareOp;
  value: number;
}

/** A number comparison on a stat with no denominator — absolute only (DECISION 3). */
export interface PlainStatLeaf {
  kind: "stat";
  subject: ConditionSubject;
  stat: PlainStat;
  /** Optional and only ever "absolute": there is no percent of an attack speed. */
  mode?: "absolute";
  op: CompareOp;
  value: number;
}

export type StatLeaf = ResourceStatLeaf | PlainStatLeaf;

/** 「目標不是英雄」 is `not` of this. Always a POSITIVE test — see DECISION 2. */
export interface KindLeaf {
  kind: "kind";
  subject: ConditionSubject;
  is: ConditionEntityKind;
}

export type ConditionLeaf = ChanceLeaf | StatLeaf | KindLeaf;

/** 且 — every child must hold. Schema requires ≥1 child, so it is never vacuous. */
export interface AllCondition {
  all: EffectCondition[];
}
/** 或 — at least one child must hold. */
export interface AnyCondition {
  any: EffectCondition[];
}
/** 非 — inverts its child, including an unreadable one (DECISION 2). */
export interface NotCondition {
  not: EffectCondition;
}

export type EffectCondition = AllCondition | AnyCondition | NotCondition | ConditionLeaf;

export const isAll = (c: EffectCondition): c is AllCondition =>
  (c as AllCondition).all !== undefined;
export const isAny = (c: EffectCondition): c is AnyCondition =>
  (c as AnyCondition).any !== undefined;
export const isNot = (c: EffectCondition): c is NotCondition =>
  (c as NotCondition).not !== undefined;
export const isLeaf = (c: EffectCondition): c is ConditionLeaf =>
  !isAll(c) && !isAny(c) && !isNot(c);

/** Children of a group, or `[]` for a leaf — the ONE traversal both phases use. */
function childrenOf(c: EffectCondition): readonly EffectCondition[] {
  if (isAll(c)) return c.all;
  if (isAny(c)) return c.any;
  if (isNot(c)) return [c.not];
  return [];
}

/** Nesting depth of a tree (a bare leaf is 1). Shared with the Zod depth check. */
export function conditionDepth(c: EffectCondition): number {
  let deepest = 0;
  for (const child of childrenOf(c)) {
    const d = conditionDepth(child);
    if (d > deepest) deepest = d;
  }
  return deepest + 1;
}

/** How many `chance` leaves — i.e. exactly how many rng draws it costs (DECISION 1). */
export function conditionChanceCount(c: EffectCondition): number {
  if (isLeaf(c)) return c.kind === "chance" ? 1 : 0;
  let n = 0;
  for (const child of childrenOf(c)) n += conditionChanceCount(child);
  return n;
}

// ---------------------------------------------------------------------------
// READING THE WORLD — every reader returns null for "cannot be read" (DECISION 2)
// ---------------------------------------------------------------------------

/** `PlainStat` → the `Stat` enum member it reads off `StatsComp.final`. */
const PLAIN_TO_STAT: Partial<Record<PlainStat, Stat>> = {
  ad: Stat.AttackDamage,
  ap: Stat.AbilityPower,
  armor: Stat.Armor,
  magicResist: Stat.MagicResist,
  moveSpeed: Stat.MoveSpeed,
  attackSpeed: Stat.AttackSpeed,
};

/** `PlainStat` → the 三圍 key it reads live off the champion (#248 + #260). */
const PLAIN_TO_ATTR: Partial<Record<PlainStat, AttrKey>> = {
  str: "str",
  agi: "agi",
  int: "int",
};

/** This body's level — champion level, else summon level, else unreadable. */
function readLevel(world: SimWorld, id: EntityId): number | null {
  const champ = world.champion.get(id);
  if (champ) return champ.level;
  // A summon's level is optional on SummonComp (a body summoned by non-champion
  // content has none), so `?? null` rather than a cast: an absent level is
  // UNREADABLE, not level 0, and level 0 would make 「等級 >= 1」 quietly false.
  const summon = world.summon.get(id);
  if (summon) return summon.level ?? null;
  return null;
}

/**
 * The number `stat` currently has on `id` under `mode`, or null when this body
 * has no such number at all.
 *
 * `percent` divides by the CURRENT maximum, so it tracks a maxHealth buff the
 * moment it lands — which is what 「血量低於 35%」 has to mean for an execute to
 * stay fair when the target grows.
 */
export function readConditionStat(
  world: SimWorld,
  id: EntityId,
  stat: ConditionStat,
  mode: "absolute" | "percent",
): number | null {
  if (stat === "hp" || stat === "mp") {
    const h = world.health.get(id);
    if (!h) return null;
    const cur = stat === "hp" ? h.hp : h.mana;
    if (mode === "absolute") return cur;
    const max = stat === "hp" ? h.maxHp : h.maxMana;
    // A body with no mana pool has no mana PERCENT — 0/0 is not "empty", it is
    // meaningless, and answering 0 would make 「魔力 < 20%」 true for every mob
    // in the game.
    if (!(max > 0)) return null;
    return cur / max;
  }
  if (stat === "level") return readLevel(world, id);

  const attr = PLAIN_TO_ATTR[stat];
  if (attr !== undefined) {
    // 「總」 — innate + growth + 能力屬性強化 picks + EQUIPMENT (`liveAttribute`
    // at basis "total", stats/attrSources.ts). A condition editor row labelled
    // 力量 has to mean the number the player's panel shows him, and the source
    // map agrees: its damage/condition formulas read
    // `GetHeroStatBJ(stat, u, true)` — bonuses INCLUDED. (The one place WC3
    // passes `false` is 獸化心靈's hidden ceiling, which is why the ceiling in
    // `effects/grantAttribute.ts` reads basis "base" and this does not.)
    // Nothing in the shipped catalogue moves: no item granted 三圍 before the
    // two legendary weapons that landed with this field, so total ≡ base for
    // every pre-existing condition.
    return liveAttribute(world, id, attr, "total");
  }

  const s = PLAIN_TO_STAT[stat];
  if (s === undefined) return null;
  const sc = world.stats.get(id);
  if (!sc) return null;
  return sc.final[s];
}

/** Is `id` a body of kind `is`? Four positive tests, no fallthrough. */
export function entityIsKind(world: SimWorld, id: EntityId, is: ConditionEntityKind): boolean {
  switch (is) {
    case "champion":
      return world.champion.has(id);
    case "mob":
      return world.mob.has(id);
    case "summon":
      return world.summon.has(id);
    case "guardian":
      return world.structure.has(id);
  }
}

function compare(op: CompareOp, left: number, right: number): boolean {
  switch (op) {
    case ">=":
      return left >= right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case "<":
      return left < right;
    case "==":
      return left === right;
    case "!=":
      return left !== right;
  }
}

// ---------------------------------------------------------------------------
// EVALUATION — the two phases of DECISION 1
// ---------------------------------------------------------------------------

/** WHO the two subjects resolve to for one evaluation. `target` may be absent. */
export interface ConditionContext {
  /** 我方 — the hook's owner / the effect's caster. Always present. */
  self: EntityId;
  /** 敵人 — the entity the event was about. Absent on entity-less events. */
  target?: EntityId;
}

function subjectOf(ctx: ConditionContext, s: ConditionSubject): EntityId | undefined {
  return s === "self" ? ctx.self : ctx.target;
}

/**
 * PHASE 1 — the ONLY rng in this file. Draws one `chance` per `chance` leaf, in
 * a fixed pre-order, regardless of what any other leaf will answer.
 *
 * Exported for the guard: `conditionRng.test.ts` calls it directly to assert the
 * draw COUNT is a function of the tree alone.
 */
export function drawChances(
  cond: EffectCondition,
  rng: { chance(p: number): boolean },
  out: boolean[],
): void {
  if (isLeaf(cond)) {
    if (cond.kind === "chance") out.push(rng.chance(cond.p));
    return;
  }
  for (const child of childrenOf(cond)) drawChances(child, rng, out);
}

/** Cursor into the phase-1 draws. Mutable so the pre-order walk stays in step. */
interface RollCursor {
  readonly rolls: readonly boolean[];
  i: number;
}

/**
 * PHASE 2 — pure. Walks the SAME pre-order as {@link drawChances} and
 * DOES NOT SHORT-CIRCUIT (see DECISION 1): `ok = ok && evalNode(...)` would skip
 * children and desynchronise the cursor, so every child is evaluated into a
 * local first and combined afterwards.
 */
function evalNode(
  world: SimWorld,
  cond: EffectCondition,
  ctx: ConditionContext,
  cur: RollCursor,
): boolean {
  if (isAll(cond)) {
    let ok = true;
    for (const child of cond.all) {
      const r = evalNode(world, child, ctx, cur);
      ok = ok && r;
    }
    return ok;
  }
  if (isAny(cond)) {
    let ok = false;
    for (const child of cond.any) {
      const r = evalNode(world, child, ctx, cur);
      ok = ok || r;
    }
    return ok;
  }
  if (isNot(cond)) return !evalNode(world, cond.not, ctx, cur);

  if (cond.kind === "chance") {
    const v = cur.rolls[cur.i];
    cur.i++;
    // Phase 1 drew one per leaf, so this is unreachable; false rather than a
    // throw keeps a mid-match desync from becoming a crashed shard.
    return v ?? false;
  }
  if (cond.kind === "kind") {
    const id = subjectOf(ctx, cond.subject);
    if (id === undefined) return false;
    return entityIsKind(world, id, cond.is);
  }
  const id = subjectOf(ctx, cond.subject);
  if (id === undefined) return false;
  const have = readConditionStat(world, id, cond.stat, cond.mode ?? "absolute");
  if (have === null) return false;
  return compare(cond.op, have, cond.value);
}

/**
 * Does this condition hold RIGHT NOW? `undefined` = no condition = true, which
 * is what every hook authored before this field existed means, so arming the
 * field is a strict no-op until content opts in.
 *
 * ⚠️ CONSUMES `world.rng` — exactly `conditionChanceCount(cond)` draws, always.
 * Call it once per decision, never twice for the same swing, and never from a
 * display/preview path (use {@link describeCondition} there).
 */
export function evaluateCondition(
  world: SimWorld,
  cond: EffectCondition | undefined,
  ctx: ConditionContext,
): boolean {
  if (cond === undefined) return true;
  const rolls: boolean[] = [];
  drawChances(cond, world.rng, rolls);
  return evalNode(world, cond, ctx, { rolls, i: 0 });
}

// ---------------------------------------------------------------------------
// EDITING A LEAF — the two repairs a dropdown UI cannot skip
// ---------------------------------------------------------------------------

/**
 * Point a stat leaf at a DIFFERENT stat, repairing `mode` and `value` so the
 * result is always authorable.
 *
 * WHY THIS LIVES IN SHARED AND NOT IN THE REACT COMPONENT. Two silent-corruption
 * paths run through this one transition and both are load-bearing:
 *
 *   1. 「目標生命 < 35%」 → switch the stat dropdown to 攻速. `percent` has no
 *      denominator there (DECISION 3), so the leaf is now UNPARSEABLE — the form
 *      looks fine and the save 422s, or worse, a laxer surface writes it through.
 *      This forces `mode: "absolute"`.
 *   2. The VALUE means something different on the other side of that switch:
 *      0.35 was 35 %, and as an absolute it is a third of one hit point, i.e. a
 *      gate that is false forever. Carrying it over would be a card that
 *      silently stopped working. It resets instead.
 *
 * Putting it here rather than inside the widget means the ADMIN port (#272) and
 * any future surface get the same repair, and — more to the point — that it is
 * testable against the real Zod schema instead of through a DOM.
 */
export function retargetStatLeaf(leaf: StatLeaf, stat: ConditionStat): StatLeaf {
  const mode = leaf.mode ?? "absolute";
  if (statSupportsPercent(stat)) {
    return { kind: "stat", subject: leaf.subject, stat, mode, op: leaf.op, value: leaf.value };
  }
  return {
    kind: "stat",
    subject: leaf.subject,
    stat,
    mode: "absolute",
    op: leaf.op,
    value: mode === "percent" ? 0 : leaf.value,
  };
}

/**
 * Switch a stat leaf between 絕對值 and 百分比, or return it UNCHANGED when the
 * stat does not admit percent. The value is clamped into the destination mode's
 * range for the same reason {@link retargetStatLeaf} resets it — 0.35 is a legal
 * percent and a nonsense absolute.
 */
export function setStatLeafMode(leaf: StatLeaf, mode: "absolute" | "percent"): StatLeaf {
  if (!statSupportsPercent(leaf.stat)) return leaf;
  if (mode === "percent") {
    const v = leaf.value < CONDITION_PERCENT_MIN ? CONDITION_PERCENT_MIN : leaf.value;
    return {
      kind: "stat",
      subject: leaf.subject,
      stat: leaf.stat,
      mode: "percent",
      op: leaf.op,
      value: v > CONDITION_PERCENT_MAX ? CONDITION_PERCENT_MAX : v,
    };
  }
  return {
    kind: "stat",
    subject: leaf.subject,
    stat: leaf.stat,
    mode: "absolute",
    op: leaf.op,
    value: 0,
  };
}

// ---------------------------------------------------------------------------
// THE VISIBLE HALF — 「條件一定要看得見」
// ---------------------------------------------------------------------------

const SUBJECT_LABEL: Record<ConditionSubject, string> = { self: "自己", target: "目標" };

const STAT_LABEL: Record<ConditionStat, string> = {
  hp: "生命",
  mp: "魔力",
  str: "力量",
  agi: "敏捷",
  int: "智力",
  ad: "攻擊力",
  ap: "法術強度",
  armor: "護甲",
  magicResist: "魔法抗性",
  moveSpeed: "移動速度",
  attackSpeed: "攻擊速度",
  level: "等級",
};

/** `==`/`!=` read badly in a tooltip; the other four are already the maths sign. */
const OP_LABEL: Record<CompareOp, string> = {
  ">=": "≥",
  "<=": "≤",
  ">": ">",
  "<": "<",
  "==": "=",
  "!=": "≠",
};

const KIND_LABEL: Record<ConditionEntityKind, string> = {
  champion: "英雄",
  mob: "小兵",
  summon: "召喚物",
  guardian: "守護者",
};

/** Trim a ratio to a percent without trailing zeros: 0.35 → "35%", 0.125 → "12.5%". */
function pct(ratio: number): string {
  const v = ratio * 100;
  const rounded = Math.round(v * 100) / 100;
  return `${rounded}%`;
}

function num(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

function describeLeaf(leaf: ConditionLeaf): string {
  if (leaf.kind === "chance") return `${pct(leaf.p)} 機率`;
  if (leaf.kind === "kind") return `${SUBJECT_LABEL[leaf.subject]}是${KIND_LABEL[leaf.is]}`;
  const who = SUBJECT_LABEL[leaf.subject];
  const what = STAT_LABEL[leaf.stat];
  const op = OP_LABEL[leaf.op];
  const rhs = (leaf.mode ?? "absolute") === "percent" ? pct(leaf.value) : num(leaf.value);
  return `${who}${what} ${op} ${rhs}`;
}

/**
 * The human sentence for a condition — 「目標不是英雄 且 目標生命 < 35%」.
 *
 * THIS IS NOT DECORATION, and it is not typed into any doc by hand. owner asked
 * for 「即時把條件翻成人話」 in the editor AND for the player to see it on the
 * card; both read THIS function, over THE SAME OBJECT the sim gates on. A
 * hand-written condition sentence is a comment, and comments lie (CLAUDE.md
 * 第三守則) — change the gate and every surface changes with it.
 *
 * `not` of a `kind` leaf is special-cased to 「目標不是英雄」 rather than
 * 「非（目標是英雄）」 because that exact phrase is the one the 獸矛 card has to
 * print, and 「非（…）」 around the single most common negation would read like a
 * machine translation of itself.
 */
export function describeCondition(cond: EffectCondition | undefined): string | null {
  if (cond === undefined) return null;
  return describeNode(cond, 0);
}

function describeNode(cond: EffectCondition, depth: number): string {
  if (isLeaf(cond)) return describeLeaf(cond);
  if (isNot(cond)) {
    const inner = cond.not;
    if (isLeaf(inner) && inner.kind === "kind") {
      return `${SUBJECT_LABEL[inner.subject]}不是${KIND_LABEL[inner.is]}`;
    }
    return `非（${describeNode(inner, depth + 1)}）`;
  }
  const joiner = isAll(cond) ? " 且 " : " 或 ";
  const kids = isAll(cond) ? cond.all : cond.any;
  const body = kids.map((k) => describeNode(k, depth + 1)).join(joiner);
  // Only parenthesise NESTED groups: the top-level sentence should read as prose,
  // an inner one has to bind visibly or 「A 且 B 或 C」 is ambiguous.
  return depth === 0 || kids.length < 2 ? body : `（${body}）`;
}

/**
 * The condition sentence prefixed for a card/tooltip — 「觸發條件：…」 — or null.
 * One helper so the ability tooltip, the item card and the codex cannot drift
 * into three different prefixes for the same fact.
 */
export function conditionLabel(cond: EffectCondition | undefined): string | null {
  const s = describeCondition(cond);
  return s === null ? null : `觸發條件：${s}`;
}

/**
 * Every distinct condition sentence a hook-carrying doc holds, in authored
 * order, de-duplicated — what a shop card / skill tooltip prints.
 *
 * Structural parameter type so ONE function serves both sides of the content
 * boundary (the loaded doc and the registered def), exactly like
 * `itemRequirementLabels`.
 */
export function hookConditionLabels(def: {
  passive?: readonly { condition?: EffectCondition }[];
  auras?: readonly { hooks?: readonly { condition?: EffectCondition }[] }[];
}): string[] {
  const out: string[] = [];
  const push = (c: EffectCondition | undefined): void => {
    const s = conditionLabel(c);
    if (s !== null && !out.includes(s)) out.push(s);
  };
  for (const h of def.passive ?? []) push(h.condition);
  for (const a of def.auras ?? []) for (const h of a.hooks ?? []) push(h.condition);
  return out;
}

/**
 * The same list for an ABILITY, whose hooks are nested one level deeper
 * (`passive.ranks[N].hooks[]` plus each rank's `auras[].hooks[]`).
 *
 * ⚠️ WALKS EVERY RANK, NOT JUST THE LEARNED ONE. A tooltip is read BEFORE the
 * point is spent, and a gate that only appears at rank 3 is exactly the thing a
 * player needs to know while deciding whether to spend there. Dedup collapses
 * the common case where every rank carries the identical gate.
 *
 * Structural parameter type, like `itemRequirementLabels` — one function for the
 * loaded `AbilityDoc` and the registered `AbilityDef`.
 */
export function abilityConditionLabels(def: {
  passive?: {
    ranks: readonly {
      hooks?: readonly { condition?: EffectCondition }[];
      auras?: readonly { hooks?: readonly { condition?: EffectCondition }[] }[];
    }[];
  };
}): string[] {
  const out: string[] = [];
  const push = (c: EffectCondition | undefined): void => {
    const s = conditionLabel(c);
    if (s !== null && !out.includes(s)) out.push(s);
  };
  for (const rank of def.passive?.ranks ?? []) {
    for (const h of rank.hooks ?? []) push(h.condition);
    for (const a of rank.auras ?? []) for (const h of a.hooks ?? []) push(h.condition);
  }
  return out;
}

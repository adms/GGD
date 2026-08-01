/**
 * `taunt` — 嘲弄. Force enemies to auto-target the caster for a while.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SHIPPED CARD THIS EXISTS FOR
 *
 * 鍊金術之盾 (content/items/godie-i06q.json):
 *   「[嘲弄] 每秒吸引周圍敵人優先攻擊自己，持續 0.5秒」
 *
 * 「每秒」 is NOT expressed here. It is `HookDef.internalCooldown: 1` on an
 * `onInterval` hook — the field that already exists, already sits in the
 * editor, and already scales with `combatEnv.itemCooldown` for an item source.
 * Inventing a second cadence concept on this effect would be the exact mistake
 * `systems/IntervalHookSystem.ts` DECISION 1 talks itself out of. So this
 * handler owns 「一發嘲弄」 and nothing else: WHO, HOW LONG.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES *NOT* OWN
 *
 * Not the state model (sim/taunt.ts), and not the question 「被嘲弄的人現在真的
 * 打得到嘲弄者嗎」 (`targeting.forcedTargetOf`, re-asked every tick). This file
 * only writes; every legality judgement is made at READ time so that a taunter
 * who dies, hides, or leaves the zone stops pulling on the same tick.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 單體 vs 範圍 IS ONE FIELD, NOT TWO KINDS
 *
 * `radius` absent = the effect's own resolved targets (an ability-targeted WC3
 * taunt); present = a circle around the CASTER (this item). They differ only in
 * WHO, never in WHAT, so splitting them into two kinds would duplicate the
 * duration/expiry/config half twice and give the editor two cards that mean the
 * same thing.
 *
 * The circle goes through `enemiesInCircle`, i.e. the SAME query every ability
 * AoE uses — so the team filter, the zone filter, the aliveOnly filter and the
 * 隱形擋不擋 AoE field are all inherited rather than re-derived. And the radius
 * goes through `resolveAbilityRadius`, i.e. `combatEnv.abilityRange`, for the
 * reason aura.ts DECISION 3 gives: an area that ignored the operator's range
 * budget would be the one exception nobody remembers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM
 *
 * Draws nothing from `world.rng` — there is no roll to make. `enemiesInCircle`
 * returns ASCENDING entity ids (the `queryOverlap` guarantee) and the `sort`
 * below is a TOTAL order in EVERY one of `tauntRules.capOrder`'s three modes
 * (each ends on `id`), which matters because the cap cuts the list exactly
 * there — the same argument damageArea.ts makes for its own sort. Expiry is an
 * absolute tick, computed in sim/taunt.ts.
 */
import type { EntityId } from "../../ids";
import type { EffectKindSpec } from "./effectKind";
import { applyTaunt, type TauntCapOrder } from "../taunt";
import { enemiesInCircle, resolveAbilityRadius } from "../abilities/abilitySystem";
import { distSq } from "../math/vec2";

/**
 * 「這一發最多拉幾個人」 —— the AUTHORED number under the OPERATOR's ceiling.
 *
 * ⭐ 決策點做成欄位。The old shape was `clampTargets(raw)` against a hardcoded
 * `TAUNT_MAX_TARGETS = 20`, which meant the operator had exactly no say: a card
 * that omitted `maxTargets` pulled twenty bodies and there was no console
 * anywhere that could say otherwise. `tauntRules.maxTargetsCap` is BOTH ends of
 * that — the value an absent `maxTargets` resolves to, AND the ceiling an
 * authored one is clamped into — deliberately one number rather than two,
 * because two numbers answering 「一發最多拉幾個」 is a drift waiting to happen.
 */
function resolveCap(raw: number | undefined, operatorCap: number): number {
  if (raw === undefined || !Number.isFinite(raw)) return operatorCap;
  const n = Math.round(raw);
  if (n < 1) return 1;
  return n > operatorCap ? operatorCap : n;
}

/** One candidate for the cap, with every key the three orders need. */
interface Candidate {
  id: EntityId;
  d2: number;
  hp: number;
}

/**
 * ⭐ 決策點做成欄位:`maxTargetsCap` 砍人的時候**留下哪幾個**
 * (`tauntRules.capOrder`). Nearest-first was hardcoded with a comment defending
 * it; by CLAUDE.md's own test that comment was the evidence it is a field.
 *
 * ALL THREE ARE TOTAL ORDERS — every one of them ends on `id`, which is what
 * stops 「五隻殭屍裡拉哪三隻」 from becoming an artefact of
 * `Array.prototype.sort`'s implementation. `enemiesInCircle` already returns
 * ascending ids, so "id" is a plain no-op sort rather than a re-derivation.
 */
function compareBy(order: TauntCapOrder): (a: Candidate, b: Candidate) => number {
  switch (order) {
    case "lowestHp":
      return (a, b) => (a.hp !== b.hp ? a.hp - b.hp : a.d2 !== b.d2 ? a.d2 - b.d2 : a.id - b.id);
    case "id":
      return (a, b) => a.id - b.id;
    default:
      return (a, b) => (a.d2 !== b.d2 ? a.d2 - b.d2 : a.id - b.id);
  }
}

export const tauntEffect: EffectKindSpec<"taunt"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // The master switch is honoured HERE as well as in `applyTaunt`, so a
    // disabled mechanic costs nothing at all — no broad-phase query per pulse
    // on every shield holder in the match.
    if (!world.tauntRules.enabled) return;

    let subjects: readonly EntityId[];
    if (e.radius === undefined) {
      subjects = ctx.targets;
    } else {
      const t = world.transform.get(ctx.caster);
      if (!t) return;
      const radius = resolveAbilityRadius(world, e.radius);
      if (!(radius > 0)) return;
      const found: Candidate[] = [];
      for (const id of enemiesInCircle(world, ctx.caster, t.pos, radius)) {
        const vt = world.transform.get(id);
        if (!vt) continue;
        found.push({ id, d2: distSq(t.pos, vt.pos), hp: world.health.get(id)?.hp ?? 0 });
      }
      // TOTAL ORDER (see `compareBy`) — WHICH order is `tauntRules.capOrder`.
      // The cap slices exactly here, so a non-total order would make "which 3
      // of the 5 zombies got pulled" an artefact of Array.prototype.sort.
      found.sort(compareBy(world.tauntRules.capOrder));
      const cap = resolveCap(e.maxTargets, world.tauntRules.maxTargetsCap);
      if (found.length > cap) found.length = cap;
      subjects = found.map((f) => f.id);
    }

    let pulled = 0;
    for (const s of subjects) {
      if (applyTaunt(world, s, ctx.caster, e.durationSec)) pulled++;
    }
    // ② THE PLAYER MUST BE ABLE TO SEE IT. A taunt has no health bar, no stat
    // panel row and no floating number — without an event the only evidence it
    // fired is enemies turning around, which is exactly the kind of thing that
    // looks like "the AI wandered off" when it silently stops working.
    // Only when somebody was actually pulled.
    if (pulled > 0) {
      world.emit("taunt", {
        source: ctx.caster,
        count: pulled,
        durationSec: e.durationSec,
        origin: ctx.origin,
      });
    }
  },
};

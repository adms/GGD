/**
 * `grantGold` — 發放金幣, optionally scaled by the TARGET's level.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SHIPPED CARD THIS EXISTS FOR
 *
 * 鍊金術之盾 (content/items/godie-i06q.json):
 *   「[煉金術] 受敵人攻擊時，有 10%機率將直接將 HP 低於 5% 的敵人變成黃金
 *     (敵方單位直接死亡，黃金數量為敵方等級)」
 *
 * Everything in that sentence EXCEPT the payout was already authorable: the
 * trigger is an `onDamageTaken` hook, 「10%機率」 is `HookDef.chance`,
 * 「HP 低於 5%」 is a `stat` condition on `subject: "target"`, and 「直接死亡」
 * is `damage.hpPct {basis:"max"}`. The gold was the one genuinely missing
 * piece, and 「數量為敵方等級」 is why it could not be a flat number.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ IT PAYS AT PROC TIME, NOT AT KILL CONFIRMATION — AND THAT IS A REAL LIMIT
 *
 * The lethal damage this ships beside does NOT resolve inline: `damage` pushes
 * a packet onto `world.damageQueue`, and `combatResolveSystem` drains it later
 * in the same tick. So at the moment this handler runs, the victim is still
 * alive and there is no kill to hang the payout on.
 *
 * The alternative was an `onKill` hook, and it is worse, specifically: `onKill`
 * carries no provenance for WHICH damage killed, so an alchemy payout authored
 * there would fire on EVERY kill the shield holder ever makes — a different
 * item. Paying here is honest because the card's own condition makes the kill
 * a certainty: 35 % of MAX health against a body already under 5 % of max is
 * seven times lethal.
 *
 * ⚠️ THE ONE HOLE, STATED RATHER THAN HIDDEN: a SHIELD on the victim can absorb
 * the packet, in which case the gold is paid and nothing dies. It needs a shield
 * larger than 35 % of the victim's max health to sit on a body under 5 %, which
 * no shipped content produces — but it is not impossible, so it is written down
 * here and in the item's `authoringNote` instead of being asserted away.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHAT "LEVEL" RESOLVES TO — AND IT IS A FIELD, NOT A CONSTANT
 *
 * champion → `ChampionComp.level`; 召喚物 → `SummonComp.level` when it has one.
 * A **MOB HAS NO PER-ENTITY LEVEL AT ALL**: `spawnMobBody` writes zone / team /
 * kind / target / cd / spawnTick and nothing else — the wave's level lives on
 * `MobRules`, baked per round on the HOST.
 *
 * ⚠️ 第三守則 —— THE COMMENT THAT USED TO STAND HERE WAS FALSE. It said reading
 * the wave level 「would mean this file needs the round's rules, which the
 * effect context does not carry」. `EffectContext.world` IS the `SimWorld`, and
 * `SimWorld.mobRules` (with its `level`) has been sitting on it since #215. The
 * consequence of believing that comment was failure shape ②: 「黃金數量為敵方
 * 等級」 paid **0** for every zombie in the game, silently, while the card said
 * otherwise and the transmute animation played anyway.
 *
 * So it is now two authorable fields rather than one hardcoded 0:
 *   · `mobLevelSource` ("wave" default) — 小怪用波次等級, or don't use one;
 *   · `fallbackLevel`  (0 default)      — what a body with NO level at all is
 *     worth, including a mob when `mobRules` is null (any round before the
 *     waves arm, the client's prediction world, a unit test).
 *
 * A mob also still pays the #215 `mobKill` bounty to whoever lands the blow —
 * this is on top of that, not instead of it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM / PURITY
 *
 * Pure reads plus `grantGold` (which writes `champion.gold` + the scoreboard).
 * No rng, no clock, no Map iteration. The payout is rounded to a whole number
 * because gold is an integer everywhere else in the economy (`grantGold` itself
 * does not round, and a fractional purse would show up as `123.00000000001` in
 * the shop).
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { EffectKindSpec } from "./effectKind";
import { grantGold as grantGoldTo } from "../economy/progression";

/** Default for `grantGold.mobLevelSource` — 小怪按**波次等級**算。 */
export const DEFAULT_MOB_LEVEL_SOURCE: MobLevelSource = "wave";
/** Ceiling for the authored `fallbackLevel` (the champion level cap). */
export const MAX_FALLBACK_LEVEL = 99;

/** 見 `EffectDef.grantGold.mobLevelSource`. */
export type MobLevelSource = "wave" | "fallback";

/**
 * The level of `id` for a per-level payout.
 *
 * ORDER, and every step of it is a real body kind rather than a guess:
 *   1. 英雄  → `ChampionComp.level`;
 *   2. 召喚物 → `SummonComp.level` when the summon declares one;
 *   3. 小怪  → the ROUND's `mobRules.level` (task #217's own curve —
 *      `baseLevel + levelPerRound * (round - fromRound)`), when
 *      `mobLevelSource` says "wave" AND the waves are actually armed;
 *   4. 其它  → `fallbackLevel` (0 unless the card says otherwise).
 *
 * ⚠️ Step 3 reads the wave rules rather than inventing a number: 「敵方等級」
 * for a zombie has exactly one honest answer in this game and it is the one the
 * mob's own hp/regen curves are already computed from. Step 4 stays 0 by
 * default for the reason the old comment gave and which is still right —
 * answering 1 for a body with no level concept is a number from nowhere.
 */
export function levelOfTarget(
  world: SimWorld,
  id: EntityId,
  mobLevelSource: MobLevelSource = DEFAULT_MOB_LEVEL_SOURCE,
  fallbackLevel = 0,
): number {
  const champ = world.champion.get(id);
  if (champ) return champ.level;
  const summon = world.summon.get(id);
  if (summon?.level !== undefined) return summon.level;
  if (mobLevelSource === "wave" && world.mob.has(id)) {
    const lv = world.mobRules?.level;
    if (lv !== undefined) return lv;
  }
  return fallbackLevel;
}

export const grantGoldEffect: EffectKindSpec<"grantGold"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const flat = e.flat ?? 0;
    const perLevel = e.perTargetLevel ?? 0;
    // A pure per-level payout with no target contributes nothing — and it must
    // not silently degrade into `flat`, because "the enemy's level" of nobody
    // is not zero-plus-a-consolation-prize, it is undefined.
    const victim = ctx.targets[0];
    const levelTerm =
      perLevel > 0 && victim !== undefined
        ? perLevel *
          levelOfTarget(
            world,
            victim,
            e.mobLevelSource ?? DEFAULT_MOB_LEVEL_SOURCE,
            e.fallbackLevel ?? 0,
          )
        : 0;
    const amount = Math.round(flat + levelTerm);
    if (amount <= 0) return;

    const payees = e.to === "target" ? ctx.targets : [ctx.caster];
    for (const p of payees) {
      // `grantGold` no-ops on a non-champion, so transmuting a zombie while a
      // summon holds the shield costs nothing and crashes nothing.
      grantGoldTo(world, p, amount);
      world.emit("goldGrant", { target: p, amount, origin: ctx.origin });
    }
  },
};

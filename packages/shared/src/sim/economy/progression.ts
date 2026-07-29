/** Leveling (等級提升) + gold economy. */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { recordGold, recordXp } from "../stats/matchStats";

/**
 * True level cap is 99. The per-round grant schedule (arena-rules.json) only
 * carries a champion to cumulative L50 by round 11; the remaining L50→L99 is
 * earned from XP — kills/assists today, and the roguelite mob-clearing planned
 * for the next version. So `grantLevels` (round grants) tops out at 50 by
 * design (rounds 12+ grant 0), while `grantXp` can climb all the way to 99.
 */
export const LEVEL_CAP = 99;
/**
 * `mob` (task #215) is the XP a killer earns per roguelite mob (喪標麥可) kill.
 * Deliberately SMALL relative to `xpToNext` (≈4,020 at L50 → ≈7,940 at L99): a
 * single mob barely moves the bar, so the DOMINANT L50→L99 climb is the
 * every-30-kills `grantLevels(1)` bonus (see MobSystem / `reward.killsPerLevel`),
 * not the per-kill XP. The mob is the intended path past the round-grant L50
 * ceiling — that is the whole point of the mechanic.
 */
export const XP_REWARDS = { kill: 120, assist: 60, roundSurvive: 100, mob: 40 };
/**
 * `killBounty` (task #90) is a ONE-TIME premium paid on top of `kill` the FIRST
 * time each enemy champion dies — extra reward for drawing first blood on a
 * player. A revived-then-rekilled victim pays base `kill` only (DeathSystem
 * tracks paid victims on `world.bountyPaid`). It rides on TOP of the ~7,600g
 * deterministic match income the price ladder is derived against, so it never
 * disturbs the stat-path arithmetic (which is about deterministic income only).
 */
/**
 * `mobKill` (task #215) is the FLAT, REPEATABLE gold a killer earns for slaying
 * a roguelite mob. Unlike `killBounty` there is NO once-per-victim bookkeeping
 * (no `bountyPaid` interaction): every mob pays a fresh 20 to whoever lands the
 * killing blow, exactly like a LoL minion. Sits OUTSIDE the deterministic
 * price-ladder income the shop is tuned against — it is optional PvE farm.
 */
export const GOLD_REWARDS = { kill: 150, assist: 75, roundWin: 300, roundLose: 150, killBounty: 100, mobKill: 20 };

/**
 * Gold every champion spawns with — the turn-1 shop purse.
 *
 * 600, and it is load-bearing (task #82). The whole price ladder is derived
 * against a match income of 600 + 750 + 2500 + 1000 + 1250 + 1500 = 7,600g, and
 * 600 is exactly TWO 300g SIMPLE items, which is what makes the opening a real
 * decision (two cheap items now, or bank it and reach a 1200g POWERFUL a full
 * round early). MatchController used to grant 500 while every design document
 * and `startingGold` in apps/platform/internal/curation assumed 600; at 500 the
 * player can buy exactly one item and the fork does not exist.
 */
export const STARTING_GOLD = 600;

export function xpToNext(level: number): number {
  return 100 + 80 * (level - 1);
}

export function grantXp(world: SimWorld, id: EntityId, amount: number): void {
  const champ = world.champion.get(id);
  const ab = world.abilities.get(id);
  const sc = world.stats.get(id);
  if (!champ || !ab || !sc) return;
  recordXp(world, id, amount); // scoreboard: total XP earned (incl. at level cap)
  if (champ.level >= LEVEL_CAP) return;
  champ.xp += amount;
  while (champ.level < LEVEL_CAP && champ.xp >= xpToNext(champ.level)) {
    champ.xp -= xpToNext(champ.level);
    champ.level++;
    ab.unspentPoints++;
    sc.dirty = true; // growth changes base stats
    world.emit("levelUp", { id, level: champ.level });
  }
}

/**
 * Grant up to `count` champion levels (arena round grants). Deterministic:
 * tops the XP bar off level by level via grantXp, so unspentPoints/stat growth
 * flow through the one levelling path. Capped at LEVEL_CAP.
 *
 * RETURNS HOW MANY LEVELS ACTUALLY LANDED, and callers that show a number to a
 * player MUST use it rather than `count`. The loop stops at `LEVEL_CAP` (99)
 * SILENTLY, and 「等級提升 +50」 (owner 2026-07-29, GH#206) is handed to people
 * who are already deep into the cap's range: a champion who has farmed 100
 * zombies to summon the king is past L50 before the payout is computed, so a
 * requested +100 (50 pool + 50 last-hit bonus) can land as ~40. Reporting the
 * request instead of the grant is failure shape ② — the settlement panel says
 * 「+100 等級」 and the level bar moves 40 — and no test that only checks
 * `champ.level > before` can see it.
 */
export function grantLevels(world: SimWorld, id: EntityId, count: number): number {
  const champ = world.champion.get(id);
  if (!champ) return 0;
  let granted = 0;
  for (let i = 0; i < count && champ.level < LEVEL_CAP; i++) {
    grantXp(world, id, xpToNext(champ.level) - champ.xp);
    granted++;
  }
  return granted;
}

export function grantGold(world: SimWorld, id: EntityId, amount: number): void {
  const champ = world.champion.get(id);
  if (!champ) return;
  champ.gold += amount;
  recordGold(world, id, amount); // scoreboard: total gold earned
}

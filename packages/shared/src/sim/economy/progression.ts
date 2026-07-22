/** Leveling (等級提升) + gold economy. */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { recordGold, recordXp } from "../stats/matchStats";

export const LEVEL_CAP = 18;
export const XP_REWARDS = { kill: 120, assist: 60, roundSurvive: 100 };
export const GOLD_REWARDS = { kill: 150, assist: 75, roundWin: 300, roundLose: 150 };

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
 * Grant exactly `count` champion levels (arena round grants). Deterministic:
 * tops the XP bar off level by level via grantXp, so unspentPoints/stat growth
 * flow through the one levelling path. Capped at LEVEL_CAP.
 */
export function grantLevels(world: SimWorld, id: EntityId, count: number): void {
  const champ = world.champion.get(id);
  if (!champ) return;
  for (let i = 0; i < count && champ.level < LEVEL_CAP; i++) {
    grantXp(world, id, xpToNext(champ.level) - champ.xp);
  }
}

export function grantGold(world: SimWorld, id: EntityId, amount: number): void {
  const champ = world.champion.get(id);
  if (!champ) return;
  champ.gold += amount;
  recordGold(world, id, amount); // scoreboard: total gold earned
}

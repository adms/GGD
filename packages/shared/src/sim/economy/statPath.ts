/**
 * statPath — 「隨機的能力屬性強化，累積購買到 20 次之後…且沒有購買任何道具
 * (除了隨機三選一給的武器)…隨機出現加強 10~100% 能力屬性強化傳說道具」.
 *
 * THE FORK. A match is worth ~7,600g deterministically (600 start + 750 + 2500
 * + 1000 + 1250 + 1500), and 20 stat ticks cost 7,500g. So the two builds are:
 *
 *   ITEM PATH  4 POWERFUL bought + 1 quest draft + 1 legendary draft
 *              = 208 AEP = POWER x2.50. Flexible, choosable, matchup-aware.
 *   STAT PATH  20 ticks (130 AEP) + the capstone + the 2 free drafts
 *              = 220 AEP at a dud 10% roll (x2.56), 265 at the median 55% roll
 *              (x2.88), 300 at a 100% roll (x3.10).
 *
 * i.e. the stat path is a blind, inflexible, all-in gamble that pays between
 * +2% and +24% POWER over the item path. That is the correct shape for a
 * commitment mechanic: better in expectation, worse in variance and
 * adaptability, and it costs you every item purchase in the match.
 *
 * THE PRICE ENFORCES THE CONDITION. Because 7,500g is 99% of the deterministic
 * 7,600g income, 「沒有購買任何道具」 is enforced by arithmetic rather than by a
 * rule the player has to remember: only a WINNING player (9,100g+ before kill
 * gold) has the 1,600g of slack that would even let them cheat, and spending it
 * is precisely what disqualifies them.
 *
 * THE RESET RULE IS HARD (user, 2026-07-22: 「第 19 次時買了普通道具會怎樣——
 * 歸零」). Any gold purchase of a real item zeroes {@link ChampionComp.statStacks}
 * at any stack, including 19. That is what makes the fork a real commitment
 * rather than a free option. It lives in `buyItem` (economy/shop.ts) — the one
 * place a gold purchase can happen — and NOT in `grantItemFree`, which is how a
 * 3-choose-1 card lands its weapon: 「除了隨機三選一給的武器」.
 *
 * DETERMINISM. Both rolls (which stat, and the capstone magnitude) come off
 * `world.rng`, so a replay of the same seed and the same intent stream produces
 * the same build. Nothing here reads a clock.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { attachSource } from "../stats/statPipeline";
import type { StatModifier } from "../stats/modifiers";
import {
  CAPSTONE_ITEM_ID,
  CAPSTONE_STEPS,
  STAT_TICK_PRICE,
  STAT_TICK_TARGET,
  STAT_TICK_ROLLS,
  capstoneModifiers,
} from "./itemTiers";

export type StatTickResult = "ok" | "no-gold" | "no-champion";

/**
 * THE ROUND GATE (task #104). Even at {@link STAT_TICK_TARGET} stacks the
 * capstone is WITHHELD until the match reaches this round, so 傳說·萬象強化 can
 * never land before 「大約是第五場之後」 — the pacing the 375g tick price was
 * tuned to. itemTiers.ts shows the 20th tick lands in the round-6 shop on every
 * deterministic income path, but a winning streak's extra kill/round gold could
 * otherwise buy the 20th tick a round or two early; this gate makes the pacing a
 * guarantee rather than an arithmetic accident.
 */
export const CAPSTONE_ROUND_GATE = 6;

/**
 * Whether the match has reached the capstone's unlock round. `world.round === 0`
 * (unit tests / the client's prediction shadow — no round tracking) is treated
 * as ungated, exactly like the pre-#104 behaviour.
 */
export function capstoneRoundReached(world: SimWorld): boolean {
  return world.round === 0 || world.round >= CAPSTONE_ROUND_GATE;
}

export interface StatTickOutcome {
  result: StatTickResult;
  /** stack count AFTER the purchase (unchanged on failure) */
  stacks: number;
  /** the stat roll this purchase granted, or null when it failed */
  roll: StatModifier | null;
  /** rolled capstone percentage 10..100 when this tick earned it, else 0 */
  capstonePct: number;
}

/**
 * The whole stat path in one predicate: it is still live for this champion
 * while the capstone has not been granted. (A player who buys an item simply
 * restarts from 0 — the path is never permanently closed, it is only ever
 * expensive.)
 */
export function statPathLive(world: SimWorld, id: EntityId): boolean {
  const champ = world.champion.get(id);
  return champ !== undefined && champ.statCapstonePct === 0;
}

/**
 * The stat path as the SHOP needs to render it — pure, world-free, so the
 * client can call it straight off `SeatView.statStacks` / `statCapstonePct`
 * without a SimWorld. Task #38 owns the panel; this is the shape it reads, and
 * having one function means the server's numbers and the player's numbers can
 * never disagree about what "N / 20" means.
 */
export interface StatPathView {
  stacks: number;
  target: number;
  /** ticks still owed before the capstone; 0 once earned */
  remaining: number;
  /** false once 傳說·萬象強化 has been granted — there is nothing left to chase */
  live: boolean;
  /** 0, or the rolled 10..100 capstone magnitude */
  capstonePct: number;
  /**
   * How many stacks a purchase would DESTROY right now. The shop must show
   * this before the click: the reset rule is 「歸零」 at any stack, including
   * 19, and a player who loses 19 stacks they did not know they had is a
   * player who was failed by the UI, not by the rule.
   */
  atRisk: number;
}

export function statPathView(stacks: number, capstonePct: number): StatPathView {
  const live = capstonePct === 0;
  return {
    stacks,
    target: STAT_TICK_TARGET,
    remaining: live ? Math.max(0, STAT_TICK_TARGET - stacks) : 0,
    live,
    capstonePct,
    atRisk: live ? stacks : 0,
  };
}

/** Ticks still owed before the capstone (0 once earned or once past target). */
export function statTicksRemaining(world: SimWorld, id: EntityId): number {
  const champ = world.champion.get(id);
  if (!champ || champ.statCapstonePct > 0) return 0;
  return Math.max(0, STAT_TICK_TARGET - champ.statStacks);
}

/**
 * Buy one 能力屬性強化. Deducts gold, increments the streak, rolls ONE entry of
 * {@link STAT_TICK_ROLLS} uniformly and attaches it as a permanent modifier
 * source that occupies NO inventory slot — that slot-freedom is exactly what
 * the 25% price premium rents.
 *
 * On the {@link STAT_TICK_TARGET}-th consecutive tick it also grants the
 * capstone, once per champion — but never before {@link CAPSTONE_ROUND_GATE}
 * (task #104): a player who banks a winning streak to 20 stacks early still
 * waits for the round-6 shop, so the tick re-checks the gate and lands the
 * capstone on the first qualifying purchase at or after that round.
 */
export function buyStatUpgrade(world: SimWorld, id: EntityId): StatTickOutcome {
  const champ = world.champion.get(id);
  if (!champ) return { result: "no-champion", stacks: 0, roll: null, capstonePct: 0 };
  if (champ.gold < STAT_TICK_PRICE) {
    return { result: "no-gold", stacks: champ.statStacks, roll: null, capstonePct: 0 };
  }

  champ.gold -= STAT_TICK_PRICE;
  champ.statStacks += 1;
  const roll = STAT_TICK_ROLLS[world.rng.int(STAT_TICK_ROLLS.length)]!;
  // Source id carries the stack index so 20 ticks are 20 independent sources
  // and the stat pipeline sums them (rather than one overwriting the next).
  attachSource(world, id, {
    id: `stat:${champ.statStacks}`,
    kind: "augment",
    modifiers: [{ ...roll }],
  });
  world.emit("statUpgradeBought", {
    id,
    stacks: champ.statStacks,
    stat: roll.stat,
    op: roll.op,
    value: roll.value,
    gold: champ.gold,
  });

  let capstonePct = 0;
  if (
    champ.statStacks >= STAT_TICK_TARGET &&
    champ.statCapstonePct === 0 &&
    capstoneRoundReached(world)
  ) {
    capstonePct = grantCapstone(world, id);
  }
  return { result: "ok", stacks: champ.statStacks, roll, capstonePct };
}

/**
 * Grant 傳說·萬象強化 — pctAdd r to maxHealth / ad / armor / mr with r rolled
 * uniformly over the ten 10% steps. Returns the rolled percentage (10..100),
 * or 0 if it was already granted.
 */
export function grantCapstone(world: SimWorld, id: EntityId): number {
  const champ = world.champion.get(id);
  if (!champ || champ.statCapstonePct > 0) return 0;
  const pct = (world.rng.int(CAPSTONE_STEPS) + 1) * 10;
  champ.statCapstonePct = pct;
  attachSource(world, id, {
    id: `stat:capstone`,
    kind: "augment",
    modifiers: capstoneModifiers(pct),
  });
  world.emit("statCapstoneGranted", { id, itemId: CAPSTONE_ITEM_ID, pct, stacks: champ.statStacks });
  return pct;
}

/**
 * THE RESET. Called by `buyItem` on every SUCCESSFUL gold purchase of a real
 * item (and by the orb, which is a gold purchase of a weapon). Emits only when
 * something was actually destroyed, so the HUD can warn loudly — 「a player
 * cannot destroy 19 stacks without knowing」.
 */
export function resetStatPath(world: SimWorld, id: EntityId, cause: string): void {
  const champ = world.champion.get(id);
  if (!champ || champ.statStacks === 0) return;
  const lost = champ.statStacks;
  champ.statStacks = 0;
  world.emit("statPathReset", { id, lost, cause });
}

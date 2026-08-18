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
import { rollAttrChoices } from "./attrDraft";
import { ATTR_KEYS, zeroAttrBonus, type AttrBonus } from "../stats/attributes";
import {
  CAPSTONE_ITEM_ID,
  CAPSTONE_MAX_PCT,
  CAPSTONE_MIN_PCT,
  CAPSTONE_STEPS,
  STAT_TICK_PRICE,
  shopChargeFor,
  STAT_TICK_TARGET,
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
  /**
   * The 3-choose-1 this purchase OPENED — one encoded 力/敏/智 card per
   * attribute (economy/attrDraft), empty when the purchase failed.
   *
   * #260 changed what 375 gold buys. It used to grant one of nine fixed stat
   * modifiers INSTANTLY; it now buys a CARD, and the attribute only lands when
   * the player picks. The host registers the card exactly as it registers a
   * 傳說寶玉 roll, so the whole existing lifecycle — pick command, AI auto-pick,
   * the "intermission cannot end with an open offer" rule, and the expiry
   * safety net (#207) — applies with no special case.
   */
  choices: string[];
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

/**
 * WHAT the 能力屬性強化 purchases actually bought, as the three 三圍 totals —
 * the wire projection (`SeatState.attrBonus`) that lets the shop answer
 * 「這 375g 買到什麼」 (#260, replacing the pre-#260 per-roll counts).
 *
 * Read straight off `champ.attrBonus`, which is the sim's own accumulator and
 * OUTLIVES `statStacks`: buying a real item zeroes the streak (the commitment
 * rule) but never confiscates attributes already paid for. A player who bought
 * 8 ticks then a weapon still carries those 8 attribute points, and the panel
 * has to show them.
 *
 * Ordered exactly like {@link ATTR_KEYS}, so index i on the wire is attribute i
 * on both sides and there is no name table to drift.
 */
export function attrBonusArray(world: SimWorld, id: EntityId): number[] {
  const champ = world.champion.get(id);
  if (!champ) return ATTR_KEYS.map(() => 0);
  return ATTR_KEYS.map((k) => champ.attrBonus[k]);
}

/**
 * The inverse, for the CLIENT: the wire's 3-number array → an {@link AttrBonus}
 * the shared `championStatBase` accepts. `ui/panels/statPreview` feeds this into
 * the same field the server writes, which is what makes its reconstructed panel
 * exact rather than short by every attribute ever bought.
 *
 * Tolerant of a short/absent array (a legacy snapshot, a seat with no champion
 * yet) — those read as "nothing bought", which is what they were.
 */
export function attrBonusFromArray(values: readonly number[] | undefined): AttrBonus {
  const out = zeroAttrBonus();
  if (!values) return out;
  ATTR_KEYS.forEach((k, i) => {
    const v = values[i];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  });
  return out;
}

/** Ticks still owed before the capstone (0 once earned or once past target). */
export function statTicksRemaining(world: SimWorld, id: EntityId): number {
  const champ = world.champion.get(id);
  if (!champ || champ.statCapstonePct > 0) return 0;
  return Math.max(0, STAT_TICK_TARGET - champ.statStacks);
}

/**
 * Buy one 能力屬性強化. Deducts gold, increments the streak, and OPENS a
 * 力/敏/智 三選一 (#260) — it no longer grants anything by itself.
 *
 * WHY THE GRANT MOVED TO THE PICK. Owner: 「購買能力屬性加成也是三選一 力/敏/智
 * 隨機加點 0.1-2 顯示在卡片上面」. The purchase is the trigger, the CARD is the
 * reward, and the attribute lands in `applyAttrPick`. The streak still ticks
 * here, at the moment gold moves, because the streak is a record of PURCHASES
 * (the 沒有購買任何道具 commitment) and not of picks — an unanswered card is
 * auto-picked by the host anyway (#207), so the two can only differ inside a
 * single intermission.
 *
 * On the {@link STAT_TICK_TARGET}-th consecutive tick it also grants the
 * capstone, once per champion — but never before {@link CAPSTONE_ROUND_GATE}
 * (task #104): a player who banks a winning streak to 20 stacks early still
 * waits for the round-6 shop, so the tick re-checks the gate and lands the
 * capstone on the first qualifying purchase at or after that round.
 */
export function buyStatUpgrade(world: SimWorld, id: EntityId): StatTickOutcome {
  const champ = world.champion.get(id);
  if (!champ) return { result: "no-champion", stacks: 0, choices: [], capstonePct: 0 };
  // ⭐ 這位英雄的售價倍率（見 `itemTiers.shopChargeFor`）。
  const price = shopChargeFor(champ.shopPriceMult, STAT_TICK_PRICE);
  if (champ.gold < price) {
    return { result: "no-gold", stacks: champ.statStacks, choices: [], capstonePct: 0 };
  }

  champ.gold -= price;
  champ.statStacks += 1;
  const choices = rollAttrChoices(world);
  world.emit("statUpgradeBought", {
    id,
    stacks: champ.statStacks,
    choices,
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
  return { result: "ok", stacks: champ.statStacks, choices, capstonePct };
}

/**
 * Grant 傳說·萬象強化 — pctAdd r to maxHealth / ad / armor / mr with r rolled
 * uniformly over the ten 10% steps. Returns the rolled percentage (10..100),
 * or 0 if it was already granted.
 */
export function grantCapstone(world: SimWorld, id: EntityId): number {
  const champ = world.champion.get(id);
  if (!champ || champ.statCapstonePct > 0) return 0;
  // 60 / 70 / … / 150, derived from the range constants so the three can never
  // drift apart (owner 2026-07-26: 「提高下限 60~150%」, was 10~100 = a 1-in-10
  // shot at an actual doubling for a 7,500-gold, six-round, all-or-nothing path).
  const step = (CAPSTONE_MAX_PCT - CAPSTONE_MIN_PCT) / (CAPSTONE_STEPS - 1);
  const pct = CAPSTONE_MIN_PCT + world.rng.int(CAPSTONE_STEPS) * step;
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

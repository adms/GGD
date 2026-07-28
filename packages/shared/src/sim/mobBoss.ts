/**
 * 殭屍王分紅 — how the king's prize pool is split (task #262, owner 2026-07-28:
 * 「打死殭屍王的話,結算參與傷害的英雄,照傷害比例發獎金,補最後一刀的人獎金翻倍」).
 *
 * This file is PURE ARITHMETIC on plain numbers: no SimWorld, no events, no
 * mutation. That is deliberate — the whole risk in this feature is arithmetic
 * (proportions, a doubling, and the rounding remainder), and arithmetic that
 * lives inside a tick function can only be tested through a whole simulation.
 * The lifecycle half lives in systems/MobSystem.ts and calls in here.
 *
 * ── THE THREE RULES, AND WHY EACH IS SHAPED THIS WAY ───────────────────────
 *
 * 1. DETERMINISTIC ORDER. The caller hands in a LIST, and this function sorts
 *    it by ascending entity id before it does anything else. The ledger it
 *    comes from is a `Map`, whose iteration order is INSERTION order — i.e.
 *    「誰先打到王」 — which is a real, observable difference between two hosts
 *    replaying the same match if a packet ordering ever differs. Sorting makes
 *    the payout a function of the DAMAGE TABLE and nothing else.
 *
 * 2. 翻倍 IS A WEIGHT, NOT A BONUS. The last hitter's damage counts
 *    `lastHitMultiplier` times over when the shares are computed. The obvious
 *    alternative — compute everyone's share, then double the last hitter's —
 *    makes the total paid out DEPEND ON WHO LANDED THE KILL, so the king mints
 *    gold when a low-damage player steals it. Here `sum(payout) === pool`
 *    exactly, always, and the last hitter still gets strictly more per point of
 *    damage than anybody else, which is what 「獎金翻倍」 is asking for.
 *
 * 3. THE REMAINDER IS NAMED, NOT DROPPED. `floor` on each share loses up to
 *    (n-1) gold. Rather than let it evaporate (players see a total that is not
 *    the configured prize) or hand it out by `Math.round` (which can OVERPAY
 *    and is order-sensitive), every share floors and the whole remainder goes
 *    to ONE named recipient: the last hitter when they are in the table, else
 *    the lowest entity id. So the sum is exactly `pool`, and WHO gets the odd
 *    coin is a stated rule instead of a rounding accident.
 *
 * NO FLOATS LEAK OUT: gold/xp are integers by construction. The intermediate
 * `pool * weight / totalWeight` is IEEE-754 multiply-then-divide, which is
 * exactly specified and byte-identical on every engine — no transcendentals,
 * no `**`, nothing `sim/purity.test.ts` bans.
 */
import type { EntityId } from "../ids";

/**
 * The wire names of the king's two beats, for the CONSUMERS (`eventFanout`, the
 * client's RoomStore projection and the HUD's 降臨 banner / 分紅結算 panel).
 *
 * ⚠️ The EMIT SITES (sim/mobs.summonMobBoss, sim/systems/MobSystem.payBossBounty)
 * still write the literal, and must: `eventFanout.test.ts` rejects any
 * `world.emit(<identifier>, …)` outright, because a computed event name is
 * invisible to the scrape that proves every sim event is classified. Same
 * contract, and same reason, as `KILL_COMBO_EVENT` in sim/combat/killCombo.ts.
 * The client's `ui/hud/mobBoss.test.ts` pins these two against the game-server's
 * `FANNED_OUT_EVENT_TYPES`, so a rename on one side goes red rather than
 * silently producing a HUD that listens for an event nobody sends.
 */
export const MOB_BOSS_SPAWN_EVENT = "mobBossSpawn";
export const MOB_BOSS_SLAIN_EVENT = "mobBossSlain";

/** One champion's contribution to the king: `[entity, damage dealt]`. */
export type BossDamageEntry = readonly [EntityId, number];

/** What one champion is paid when the king dies. */
export interface BossBountyShare {
  readonly id: EntityId;
  /** the damage this champion did (echoed so callers/events can show the split) */
  readonly damage: number;
  /** true when this is the champion who landed the killing blow */
  readonly lastHit: boolean;
  readonly gold: number;
  readonly xp: number;
}

/** The pool to divide. Both are whole numbers and both are paid out in full. */
export interface BossBountyPool {
  readonly gold: number;
  readonly xp: number;
}

/**
 * Split `pool` among `damagers` in proportion to damage, with the last hitter's
 * damage weighted `lastHitMultiplier`×.
 *
 * `damagers` may arrive in any order and may contain non-positive entries (a
 * champion whose only packet was fully absorbed); those are dropped. The result
 * is sorted by ascending entity id.
 *
 * DEGENERATE CASES, all of which really happen:
 *   • nobody damaged the king (it drowned in the fire ring) and there is no last
 *     hitter → NOBODY is paid, and the caller can see that from an empty array;
 *   • nobody damaged it but somebody landed the blow → that champion takes the
 *     whole pool, because the alternative is deleting a configured prize;
 *   • the last hitter is not in the damage table → they are still added, with
 *     zero damage and therefore zero proportional share, and they still receive
 *     the remainder. They killed it; they are on the payout sheet.
 */
export function splitBossBounty(
  damagers: readonly BossDamageEntry[],
  pool: BossBountyPool,
  lastHitter: EntityId | null,
  lastHitMultiplier: number,
): BossBountyShare[] {
  const gold = Math.max(0, Math.floor(pool.gold));
  const xp = Math.max(0, Math.floor(pool.xp));
  const mult = Math.max(1, lastHitMultiplier);

  // 1) Positive contributions only, plus the last hitter even at zero damage.
  const table = new Map<EntityId, number>();
  for (const [id, dmg] of damagers) {
    if (!(dmg > 0)) continue; // also filters NaN, which `<= 0` would not
    table.set(id, (table.get(id) ?? 0) + dmg);
  }
  if (lastHitter !== null && !table.has(lastHitter)) table.set(lastHitter, 0);

  // ASCENDING ENTITY ID — rule 1. Everything downstream (weights, floors, the
  // remainder recipient) reads this list, so this one sort is what makes the
  // whole payout independent of who happened to hit the king first.
  const ids = [...table.keys()].sort((a, b) => a - b);
  if (ids.length === 0) return [];

  // 2) Weights: 翻倍 for the last hitter — rule 2.
  let totalWeight = 0;
  const weights = ids.map((id) => {
    const w = (table.get(id) ?? 0) * (id === lastHitter ? mult : 1);
    totalWeight += w;
    return w;
  });

  // Nobody did any damage at all (only the zero-damage last hitter is here).
  // One recipient, the whole pool — never a division by zero.
  if (totalWeight <= 0) {
    return ids.map((id, i) => ({
      id,
      damage: table.get(id) ?? 0,
      lastHit: id === lastHitter,
      gold: i === 0 ? gold : 0,
      xp: i === 0 ? xp : 0,
    }));
  }

  // 3) Floor every share, then hand the whole remainder to ONE named recipient
  //    — rule 3.
  const goldShares = weights.map((w) => Math.floor((gold * w) / totalWeight));
  const xpShares = weights.map((w) => Math.floor((xp * w) / totalWeight));
  const remainderIdx = Math.max(
    0,
    lastHitter === null ? 0 : ids.indexOf(lastHitter),
  );
  goldShares[remainderIdx] =
    (goldShares[remainderIdx] ?? 0) + (gold - goldShares.reduce((a, b) => a + b, 0));
  xpShares[remainderIdx] =
    (xpShares[remainderIdx] ?? 0) + (xp - xpShares.reduce((a, b) => a + b, 0));

  return ids.map((id, i) => ({
    id,
    damage: table.get(id) ?? 0,
    lastHit: id === lastHitter,
    gold: goldShares[i] ?? 0,
    xp: xpShares[i] ?? 0,
  }));
}

/**
 * Does a champion's cumulative zombie tally of `kills` summon the king?
 *
 * PER CHAMPION, never per team: the caller passes ONE champion's
 * `world.mobKills` entry, so two players on 50 each summon nothing. The
 * boundary is exact — at `killThreshold - 1` this is false, at `killThreshold`
 * it is true — which is the thing worth guarding, because 「有召喚就好」 passes
 * with an off-by-one that summons a king on the 99th zombie.
 *
 * `repeatable` decides what happens AFTER the first one: `true` fires again on
 * every multiple (100, 200, 300 …), `false` fires on exactly the Nth kill and
 * never again for that champion. `mobKills` is match-cumulative and never
 * resets mid-match, so both readings are well defined without extra state.
 */
export function bossSummonsAt(
  boss: { enabled: boolean; killThreshold: number; repeatable: boolean } | null,
  kills: number,
): boolean {
  if (boss === null || !boss.enabled) return false;
  if (boss.killThreshold <= 0) return false;
  if (kills < boss.killThreshold) return false;
  return boss.repeatable ? kills % boss.killThreshold === 0 : kills === boss.killThreshold;
}

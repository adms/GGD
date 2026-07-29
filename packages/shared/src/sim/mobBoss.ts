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
 * 2. 翻倍 HAS TWO MODES, AND THE OWNER PICKED THE ONE THIS FILE USED TO ARGUE
 *    AGAINST. Until 2026-07-29 this header asserted, as a rule, that doubling
 *    must be a WEIGHT and never a bonus — because computing everyone's share
 *    and then doubling the last hitter's makes the total paid out DEPEND ON WHO
 *    LANDED THE KILL, so the king mints gold when a low-damage player steals it.
 *
 *    That reasoning is still correct. The owner read it and chose the other
 *    thing anyway, with a worked example: 「除了最後一刀的人可以雙倍領取(超過
 *    總額沒關係,極端情形第一刀就是最後一刀全傷害 = 200% 金錢跟等級獎勵)」.
 *    A last hitter who did ALL the damage takes 200% of the pool. So the total
 *    is deliberately NOT conserved, and the minting the old rule guarded against
 *    is now the feature.
 *
 *    Both survive, because the owner also said 「如果遇到有爭議的決策,請以後台
 *    編輯器可調整為解法」:
 *      · `"bonus"`  (SHIPPED DEFAULT) — split by raw damage, then pay the last
 *                   hitter one EXTRA copy of their own share. Total lands in
 *                   [pool, pool × mult]; it hits the ceiling exactly when one
 *                   champion did all the damage AND landed the blow.
 *      · `"weight"` — the old rule. `sum(payout) === pool` exactly, always.
 *
 *    ⚠️ THE CONSEQUENCE THAT IS EASY TO MISS, and the reason four other files
 *    changed with this one: in `"bonus"` mode 「總獎金 30,000」 is no longer a
 *    true sentence. Anything that displays the CONFIGURED pool as the amount
 *    paid is now lying. Every such string must read the ACTUAL total off the
 *    shares — see `bossTotalLine` / `bossRuleNote`, which take the mode.
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

/**
 * How 「最後一刀翻倍」 is paid. See rule 2 in the header for why both exist.
 *
 * `"bonus"` is the shipped default (owner 2026-07-29). `"weight"` is the
 * conserving alternative, kept because the argument for it is still sound and
 * the owner asked for contentious calls to be admin-switchable rather than
 * settled in code.
 */
export type LastHitMode = "bonus" | "weight";

/** What one champion is paid when the king dies. */
export interface BossBountyShare {
  readonly id: EntityId;
  /** the damage this champion did (echoed so callers/events can show the split) */
  readonly damage: number;
  /** true when this is the champion who landed the killing blow */
  readonly lastHit: boolean;
  readonly gold: number;
  readonly xp: number;
  /**
   * 等級提升 (owner 2026-07-29). REQUESTED levels, not necessarily granted:
   * `LEVEL_CAP` is 99 and `grantLevels` stops silently at it, so the caller
   * must report what it actually handed out. See `payMobBounty`.
   */
  readonly levels: number;
}

/**
 * The pool to divide.
 *
 * ⚠️ NAMES A CEILING, NOT A TOTAL, in the shipped `"bonus"` mode — the payout
 * lands in `[pool, pool × lastHitMultiplier]`. Only `"weight"` still pays out
 * exactly this much. See rule 2 in the header.
 */
export interface BossBountyPool {
  readonly gold: number;
  readonly xp: number;
  /** 等級提升 — whole levels, split by damage exactly like gold and xp. */
  readonly levels: number;
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
  mode: LastHitMode = "bonus",
): BossBountyShare[] {
  const gold = Math.max(0, Math.floor(pool.gold));
  const xp = Math.max(0, Math.floor(pool.xp));
  const levels = Math.max(0, Math.floor(pool.levels));
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

  // 2) Weights. THE ONE LINE THAT SEPARATES THE TWO MODES: `"weight"` counts the
  //    last hitter's damage `mult` times over here (so the doubling is already
  //    baked into the proportions and the total stays === pool); `"bonus"` uses
  //    raw damage and pays the extra copy in step 4 instead.
  let totalWeight = 0;
  const weights = ids.map((id) => {
    const w = (table.get(id) ?? 0) * (mode === "weight" && id === lastHitter ? mult : 1);
    totalWeight += w;
    return w;
  });

  // Nobody did any damage at all (only the zero-damage last hitter is here).
  // One recipient, the whole pool — never a division by zero.
  //
  // ⚠️ NO BONUS ON THIS BRANCH, in either mode. There is no 「自己的份額」 to pay
  // a second copy of — this is a consolation payout of the full pool to someone
  // who contributed nothing measurable. Doubling it would mean 「零傷害搶人頭
  // = 200%」, which is the pure minting the old rule-2 warned about and is NOT
  // what the owner's worked example asks for (theirs is 全傷害 + 補刀 → 200%).
  if (totalWeight <= 0) {
    return ids.map((id, i) => ({
      id,
      damage: table.get(id) ?? 0,
      lastHit: id === lastHitter,
      gold: i === 0 ? gold : 0,
      xp: i === 0 ? xp : 0,
      levels: i === 0 ? levels : 0,
    }));
  }

  // 3) Floor every share, then hand the whole remainder to ONE named recipient
  //    — rule 3. After this step the sum is EXACTLY the pool, in both modes.
  const split = (total: number): number[] => {
    const out = weights.map((w) => Math.floor((total * w) / totalWeight));
    const remainderIdx = Math.max(0, lastHitter === null ? 0 : ids.indexOf(lastHitter));
    out[remainderIdx] = (out[remainderIdx] ?? 0) + (total - out.reduce((a, b) => a + b, 0));
    return out;
  };
  const goldShares = split(gold);
  const xpShares = split(xp);
  const levelShares = split(levels);

  // 4) 「最後一刀的人可以雙倍領取」 — `"bonus"` only. The extra copy is of the
  //    last hitter's OWN share, computed AFTER the remainder landed, so a lone
  //    damager who also lands the blow holds the whole pool and then receives it
  //    again: exactly the 200% the owner named. `floor` keeps every payout an
  //    integer; `mult - 1` is 1.0 at the shipped ×2 and scales linearly above it.
  if (mode === "bonus" && lastHitter !== null) {
    const i = ids.indexOf(lastHitter);
    if (i >= 0) {
      goldShares[i] = (goldShares[i] ?? 0) + Math.floor((goldShares[i] ?? 0) * (mult - 1));
      xpShares[i] = (xpShares[i] ?? 0) + Math.floor((xpShares[i] ?? 0) * (mult - 1));
      levelShares[i] = (levelShares[i] ?? 0) + Math.floor((levelShares[i] ?? 0) * (mult - 1));
    }
  }

  return ids.map((id, i) => ({
    id,
    damage: table.get(id) ?? 0,
    lastHit: id === lastHitter,
    gold: goldShares[i] ?? 0,
    xp: xpShares[i] ?? 0,
    levels: levelShares[i] ?? 0,
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

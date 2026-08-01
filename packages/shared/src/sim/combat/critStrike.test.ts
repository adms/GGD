/**
 * [暴擊吸血] — THE MECHANISM, and BOTH halves of the two-path contract.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE ASSERTIONS AND NOT OTHERS
 *
 * Nothing here asserts the SHAPE of a `CritStrikeGrant` and nothing greps source
 * (失敗形態 ⑥/⑦). The unit cases call `rollCritStrike` / `effectiveLifesteal`
 * and read the numbers they return; the integration case pushes a real melee
 * swing through a real `world.step()` and reads `health.hp` on both bodies.
 *
 * The five things that have to hold, in order of how expensive getting them
 * wrong would be:
 *
 *   1. AT ZERO IT DOES NOT EXIST. No grant ⇒ no rng draw, asserted on
 *      `world.rng.state` — the ONLY observable that moves. A "damage unchanged"
 *      assertion would pass even if the gate burned a draw on every swing in
 *      the game, and every existing replay/digest would still be broken.
 *   2. `empowers` IS A REAL FIELD. `ownProcOnly` (shipped) leaves the champion's
 *      OWN crits alone; `everyCrit` empowers them. A hard-coded choice passes
 *      one of these two and fails the other.
 *   3. TWO MULTIPLIERS TAKE MAX, NOT PRODUCT — the arbitration `combat/block.ts`
 *      ⑤ already established for this codebase.
 *   4. `undefined` ≠ `0` ON THE PACKET. A `lifestealFraction: 0` grant must not
 *      be indistinguishable from "did not proc", or a non-proccing swing would
 *      zero the wielder's own lifesteal.
 *   5. BOTH BASIC-ATTACK PATHS PAY IT. 「普攻有兩個 push 站點」 (melee in
 *      `systems/BasicAttackSystem.ts`, ranged at projectile impact in
 *      `systems/ProjectileSystem.ts`) is the exact trap
 *      `combat/damageTypeOverride.ts` documents, and MEASURED here: the shipped
 *      doc's own guard in `economy/questDraftGate.test.ts` runs on 亞瑟王
 *      (godie-e002), which is MELEE — so deleting the ranged forward left the
 *      whole suite green until ⑤ below existed.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
import { critStrikeFor, effectiveLifesteal, rollCritStrike, type CritStrikeGrant } from "./critStrike";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent()); // synchronous — no 10 s hook to blow

const Z0 = SKELETON_ARENA.zones[0]!;
const LANE_Z = Z0.center.z + 14;

/** The shipped 天堂之劍 grant, restated so a fixture drift is visible here. */
const SWORD: CritStrikeGrant = { chance: 0.06, damageMult: 10, lifestealFraction: 1 };

function hero(world: SimWorld, championId: string, x: number, seat: number, team: number): EntityId {
  const id = spawnChampion(world, {
    championId: championId as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x, z: LANE_Z },
    zone: 0,
  });
  recomputeStats(world, id);
  return id;
}

function grant(world: SimWorld, id: EntityId, g: CritStrikeGrant, sourceId = "t:sword"): void {
  attachSource(world, id, { id: sourceId, kind: "item", critStrike: g });
}

describe("① 沒有內容用它的時候,它不存在", () => {
  it("no grant ⇒ ZERO rng draws — every existing replay stays bit-identical", () => {
    const world = new SimWorld(SKELETON_ARENA, 99);
    const a = hero(world, "thorne", Z0.center.x, 0, 0);
    expect(critStrikeFor(world, a)).toBeNull();

    const before = world.rng.state;
    const r = rollCritStrike(world, a, 100, 100, false);
    expect(world.rng.state, "the gate drew from the rng with no grant attached").toBe(before);
    expect(r).toEqual({ crit: false, amount: 100 });
  });

  it("a grant that could never fire (chance 0) still draws nothing", () => {
    const world = new SimWorld(SKELETON_ARENA, 99);
    const a = hero(world, "thorne", Z0.center.x, 0, 0);
    grant(world, a, { chance: 0, damageMult: 10, lifestealFraction: 1 });
    const before = world.rng.state;
    rollCritStrike(world, a, 100, 100, false);
    expect(world.rng.state).toBe(before);
  });
});

describe("② `empowers` 是一個真的欄位,不是一個寫死的選擇", () => {
  /** Force the proc/no-proc by driving the roll many times and taking both. */
  function outcomes(g: CritStrikeGrant, ownCrit: boolean): { procced: number; plain: number } {
    const world = new SimWorld(SKELETON_ARENA, 4242);
    const a = hero(world, "thorne", Z0.center.x, 0, 0);
    grant(world, a, g);
    const base = 100;
    const incoming = ownCrit ? base * 1.75 : base;
    let procced = -1;
    let plain = -1;
    for (let i = 0; i < 500 && (procced < 0 || plain < 0); i++) {
      const r = rollCritStrike(world, a, base, incoming, ownCrit);
      if (r.critLifesteal !== undefined) procced = r.amount;
      else plain = r.amount;
    }
    return { procced, plain };
  }

  it("ownProcOnly (SHIPPED): the champion's OWN crit is left at 1.75×", () => {
    const { procced, plain } = outcomes({ ...SWORD, empowers: "ownProcOnly" }, true);
    expect(procced, "the proc did not fire in 500 rolls at 6%").toBeGreaterThan(0);
    expect(procced).toBeCloseTo(1000, 6); // 100 × 10
    // ⚠️ THE WHOLE POINT: a natural crit keeps `Stat.CritDamage`'s 1.75, so a
    // champion who has stacked crit chance does not get 10× on all of it.
    expect(plain).toBeCloseTo(175, 6);
  });

  it("everyCrit: the champion's OWN crit is empowered too", () => {
    const { procced, plain } = outcomes({ ...SWORD, empowers: "everyCrit" }, true);
    expect(procced).toBeCloseTo(1000, 6);
    // Under `everyCrit` there is no 「plain」 outcome while `ownCrit` is true —
    // every swing is empowered — so the loop above never fills it. That IS the
    // difference between the two modes, stated as an assertion.
    expect(plain, "everyCrit left a natural crit un-empowered").toBe(-1);
  });

  it("absent `empowers` behaves as ownProcOnly — the conservative default", () => {
    const withField = outcomes({ ...SWORD, empowers: "ownProcOnly" }, true);
    const without = outcomes(SWORD, true);
    expect(without).toEqual(withField);
  });
});

describe("③ 兩個倍率取 max,不相乘", () => {
  it("a champion whose own critDamage exceeds the grant keeps his own number", () => {
    const world = new SimWorld(SKELETON_ARENA, 4242);
    const a = hero(world, "thorne", Z0.center.x, 0, 0);
    grant(world, a, { chance: 1, damageMult: 2, lifestealFraction: 1 });
    // incoming = a 20× natural crit; the grant's 2× must NOT win, and must NOT
    // multiply (2 × 20 = 40 would be the bug).
    const r = rollCritStrike(world, a, 100, 2000, true);
    expect(r.amount).toBeCloseTo(2000, 6);
  });

  it("and the grant wins when it is the bigger of the two", () => {
    const world = new SimWorld(SKELETON_ARENA, 4242);
    const a = hero(world, "thorne", Z0.center.x, 0, 0);
    grant(world, a, { chance: 1, damageMult: 10, lifestealFraction: 1 });
    const r = rollCritStrike(world, a, 100, 175, true);
    expect(r.amount).toBeCloseTo(1000, 6); // not 175 × 10 = 1750
  });

  it("multiple grants: the best by chance × damageMult wins, and ONE draw is spent", () => {
    const world = new SimWorld(SKELETON_ARENA, 4242);
    const a = hero(world, "thorne", Z0.center.x, 0, 0);
    grant(world, a, { chance: 1, damageMult: 3, lifestealFraction: 0.5 }, "t:weak");
    grant(world, a, { chance: 1, damageMult: 9, lifestealFraction: 1 }, "t:strong");
    const before = world.rng.state;
    const r = rollCritStrike(world, a, 100, 100, false);
    expect(r.amount).toBeCloseTo(900, 6); // the strong one, not 3 × 9 = 27×
    expect(r.critLifesteal).toBe(1);
    // ONE draw, not two — carrying two crit weapons must not double the odds.
    const world2 = new SimWorld(SKELETON_ARENA, 4242);
    const b = hero(world2, "thorne", Z0.center.x, 0, 0);
    grant(world2, b, { chance: 1, damageMult: 9, lifestealFraction: 1 }, "t:strong");
    const before2 = world2.rng.state;
    rollCritStrike(world2, b, 100, 100, false);
    expect(world.rng.state - before).toBe(world2.rng.state - before2);
  });
});

describe("④ 吸血:undefined 和 0 是兩件事", () => {
  const world = new SimWorld(SKELETON_ARENA, 1);
  let a: EntityId;
  beforeAll(() => {
    a = hero(world, "thorne", Z0.center.x, 0, 0);
  });

  it("no proc ⇒ the wielder's own Stat.Lifesteal, untouched", () => {
    expect(effectiveLifesteal(world, a, 0.3, undefined)).toBeCloseTo(0.3, 6);
  });

  it("a proc with fraction 0 really pays 0 — NOT the wielder's 0.3", () => {
    grant(world, a, { chance: 1, damageMult: 2, lifestealFraction: 0 }, "t:zero");
    expect(effectiveLifesteal(world, a, 0.3, 0)).toBe(0);
  });

  it("`replace` (SHIPPED default) ignores the stat; `add` stacks on it", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const h = hero(w, "thorne", Z0.center.x, 0, 0);
    grant(w, h, { ...SWORD, lifestealMode: "replace" });
    expect(effectiveLifesteal(w, h, 0.3, 1)).toBeCloseTo(1, 6);

    const w2 = new SimWorld(SKELETON_ARENA, 1);
    const h2 = hero(w2, "thorne", Z0.center.x, 0, 0);
    grant(w2, h2, { ...SWORD, lifestealMode: "add" });
    expect(effectiveLifesteal(w2, h2, 0.3, 1)).toBeCloseTo(1.3, 6);
  });
});

/**
 * BOTH basic-attack paths, driven end to end.
 *
 * ⚠️ THE RANGED CASE IS NOT REDUNDANT, AND THIS COMMENT IS THE RECEIPT.
 * `economy/questDraftGate.test.ts` drives the shipped 天堂之劍, and its hero is
 * `godie-e002` (亞瑟王 Saber) — MELEE. So before this case existed, deleting
 * `critLifesteal: proj.critLifesteal` from `systems/ProjectileSystem.ts` left
 * the whole suite GREEN: every ranged champion would have carried a sword that
 * hits for 10× and heals for nothing, and no test anywhere would have said so.
 * That is 失敗形態 ② exactly, and it is the trap `combat/damageTypeOverride.ts`
 * documents — 「普攻自己就有兩個 push 站點」. Mutation record in the report.
 */
describe("⑤ 兩條普攻路徑都要付得出來", () => {
  /** Swing until one basic-attack packet lands; return what it did. */
  function swingOnce(
    world: SimWorld,
    atk: EntityId,
    dummy: EntityId,
    ticks: number,
  ): { dealt: number; healed: number } {
    const dpos = { ...world.transform.get(dummy)!.pos };
    let dealt = 0;
    let healed = 0;
    for (let i = 0; i < ticks && dealt === 0; i++) {
      const dh = world.health.get(dummy)!;
      dh.hp = dh.maxHp;
      world.health.get(atk)!.hp = 1; // room for the lifesteal to land
      world.transform.get(dummy)!.pos = { ...dpos };
      world.nav.get(atk)!.attackTarget = dummy;
      world.step(new Map());
      for (const e of world.events) {
        if (e.type === "damage") {
          const d = e.data as { source: number; origin?: string; amount: number; crit?: boolean };
          if (d.source !== (atk as unknown as number) || d.origin !== "basic") continue;
          expect(d.crit, "a procced swing must read as a crit on the wire").toBe(true);
          dealt = d.amount;
        } else if (e.type === "heal") {
          const h = e.data as { target: number; origin?: string; amount: number };
          if (h.target === (atk as unknown as number) && h.origin === "lifesteal") healed = h.amount;
        }
      }
    }
    return { dealt, healed };
  }

  function armed(championId: string): { world: SimWorld; atk: EntityId; dummy: EntityId } {
    const world = new SimWorld(SKELETON_ARENA, 31337);
    const atk = hero(world, championId, Z0.center.x, 0, 0);
    const dummy = hero(world, "thorne", Z0.center.x + 1.0, 1, 1);
    // chance 1 = every swing procs, so the assertion is about the PAYOUT rather
    // than about hitting a 6% window. The probability itself is exercised in
    // ①/② above and on the shipped doc in questDraftGate.
    grant(world, atk, { chance: 1, damageMult: 10, lifestealFraction: 1 });
    // the wielder's own crit chance to 0, so the only crit is the grant's.
    attachSource(world, atk, {
      id: "t:nocrit",
      kind: "buff",
      modifiers: [{ stat: Stat.CritChance, op: ModOp.Flat, value: -1 }],
    });
    recomputeStats(world, atk);
    return { world, atk, dummy };
  }

  it("MELEE: the swing deals 10× and heals the attacker for the hp it removed", () => {
    const { world, atk, dummy } = armed("thorne");
    const { dealt, healed } = swingOnce(world, atk, dummy, 400);
    expect(dealt, "400 ticks and the melee swing never landed").toBeGreaterThan(0);
    // 100 % of the hp actually removed — the dummy has no shields and no block,
    // so that is exactly the damage number.
    expect(healed).toBeCloseTo(dealt, 6);
  });

  it("RANGED: the ARROW carries the proc — the payout lands at impact, not at the loose", () => {
    const { world, atk, dummy } = armed("sela"); // sela is `attackType: "ranged"`
    const { dealt, healed } = swingOnce(world, atk, dummy, 400);
    expect(dealt, "400 ticks and the arrow never landed").toBeGreaterThan(0);
    expect(
      healed,
      "the ranged path dealt the 10× but healed nothing — `critLifesteal` never reached the missile",
    ).toBeCloseTo(dealt, 6);
  });
});

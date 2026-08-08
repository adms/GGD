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
 *   3. EVERY SOURCE ROLLS ON ITS OWN AND THE MULTIPLIERS MULTIPLY — owner's
 *      2026-08-09 ruling (GH#302), stated as his own worked example. ⛔ This one
 *      deliberately does NOT assert 「there was a crit」: that is green under the
 *      old take-the-max arbitration too (失敗形態 ④). It asserts the PRODUCT,
 *      which take-the-max cannot produce. `stackMode` / `maxTotalMult` /
 *      `sourceCap` each get one case, because all three are 後台 fields and a
 *      hard-coded choice passes one branch and fails the others.
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
    const r = rollCritStrike(world, a, 100, 1, false);
    expect(world.rng.state, "the gate drew from the rng with no grant attached").toBe(before);
    expect(r).toEqual({ crit: false, amount: 100 });
  });

  it("a grant that could never fire (chance 0) still draws nothing", () => {
    const world = new SimWorld(SKELETON_ARENA, 99);
    const a = hero(world, "thorne", Z0.center.x, 0, 0);
    grant(world, a, { chance: 0, damageMult: 10, lifestealFraction: 1 });
    const before = world.rng.state;
    rollCritStrike(world, a, 100, 1, false);
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
    // 英雄自己那一條骰出來的倍率(不是已經乘好的傷害 —— 見 GH#302 的簽章更動)。
    const ownMult = ownCrit ? 1.75 : 1;
    let procced = -1;
    let plain = -1;
    for (let i = 0; i < 500 && (procced < 0 || plain < 0); i++) {
      const r = rollCritStrike(world, a, base, ownMult, ownCrit);
      if (r.critLifesteal !== undefined) procced = r.amount;
      else plain = r.amount;
    }
    return { procced, plain };
  }

  it("ownProcOnly (SHIPPED): 沒抽中的那一發只有英雄自己的 1.75×", () => {
    const { procced, plain } = outcomes({ ...SWORD, empowers: "ownProcOnly" }, true);
    expect(procced, "the proc did not fire in 500 rolls at 6%").toBeGreaterThan(0);
    expect(procced).toBeCloseTo(1750, 6); // 100 × (1.75 × 10) —— 兩條都算,相乘
    // ⚠️ THE WHOLE POINT: 這件武器**沒抽中**的那一發不會被它加成,所以一個堆滿
    // 暴擊率的英雄不會整場都是 10 倍 —— 他拿到的是自己的 1.75。
    expect(plain).toBeCloseTo(175, 6);
  });

  it("everyCrit: the champion's OWN crit is empowered too", () => {
    const { procced, plain } = outcomes({ ...SWORD, empowers: "everyCrit" }, true);
    expect(procced).toBeCloseTo(1750, 6);
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

/**
 * ③ owner 2026-08-09 (GH#302) 的裁決,逐字當成斷言。
 *
 * ⛔ 這裡刻意**不驗「有沒有暴擊」** —— 那對舊的取 max 實作也是綠的(失敗形態 ④)。
 * 驗的是「兩條各自的倍率**乘**起來的那個數字真的出現」,而那個數字在取 max 底下
 * 不可能出現。
 *
 * ⚠️ 出貨值也不抄進斷言(第零守則:出貨值有三個住處 + drift 測試在守)。
 * 每一條都自己造來源、自己算「該是多少」。
 */
describe("③ 每一條暴擊獨立骰、倍率依序相乘 (owner 2026-08-09)", () => {
  /** owner 的例子:1% × 100倍 + 10% × 2倍。機率換成必中/必不中來釘出每一種結果。 */
  function twoSources(world: SimWorld, a: EntityId, hit1: boolean, hit2: boolean): void {
    grant(world, a, { chance: hit1 ? 1 : 0, damageMult: 100, lifestealFraction: 0 }, "t:x100");
    grant(world, a, { chance: hit2 ? 1 : 0, damageMult: 2, lifestealFraction: 0 }, "t:x2");
  }

  /** 上限開到夠大,好讓「相乘」這件事本身看得見(上限自己另有一條驗)。 */
  function uncapped(seed: number): { world: SimWorld; a: EntityId } {
    const world = new SimWorld(SKELETON_ARENA, seed);
    world.critRules = { ...world.critRules, maxTotalMult: 100000 };
    return { world, a: hero(world, "thorne", Z0.center.x, 0, 0) };
  }

  it("兩條都中 = 100 × 2 = 200 倍 —— 取 max 拿不到這個數字", () => {
    const { world, a } = uncapped(4242);
    twoSources(world, a, true, true);
    const r = rollCritStrike(world, a, 100, 1, false);
    expect(r.crit).toBe(true);
    // 100 × (100 × 2)。取 max 會給 100 × 100 = 10000,相加會給 100 × 102 = 10200。
    expect(r.amount).toBeCloseTo(20000, 6);
  });

  it("只中其中一條 → 就是那一條的倍率(兩個方向各一次)", () => {
    const only100 = uncapped(4242);
    twoSources(only100.world, only100.a, true, false);
    expect(rollCritStrike(only100.world, only100.a, 100, 1, false).amount).toBeCloseTo(10000, 6);

    const only2 = uncapped(4242);
    twoSources(only2.world, only2.a, false, true);
    expect(rollCritStrike(only2.world, only2.a, 100, 1, false).amount).toBeCloseTo(200, 6);
  });

  it("都沒中 = 不暴擊,倍率 1", () => {
    const { world, a } = uncapped(4242);
    twoSources(world, a, false, false);
    const r = rollCritStrike(world, a, 100, 1, false);
    expect(r.crit).toBe(false);
    expect(r.amount).toBeCloseTo(100, 6);
  });

  it("英雄自己的暴擊也是一條 —— 它跟著一起乘,不是被比大小", () => {
    const { world, a } = uncapped(4242);
    grant(world, a, { chance: 1, damageMult: 3, lifestealFraction: 0 }, "t:x3");
    // 自己 4 倍暴擊 + 一條 3 倍 grant → 12 倍。取 max 會給 4(自己比較大)。
    const r = rollCritStrike(world, a, 100, 4, true);
    expect(r.amount).toBeCloseTo(1200, 6);
  });

  it("stackMode 是一個真的欄位:同一組來源 + 同一顆種子 → 三種模式三個數字", () => {
    const amounts: Record<string, number> = {};
    for (const mode of ["multiply", "max", "add"] as const) {
      const { world, a } = uncapped(4242);
      world.critRules = { ...world.critRules, stackMode: mode };
      twoSources(world, a, true, true);
      amounts[mode] = rollCritStrike(world, a, 100, 1, false).amount;
    }
    expect(amounts.multiply).toBeCloseTo(20000, 6); // 100 × 2
    expect(amounts.max).toBeCloseTo(10000, 6); // 只算最強的那一條
    expect(amounts.add).toBeCloseTo(10200, 6); // 100 + 2
  });

  it("maxTotalMult 真的夾得到 —— 而且夾的是**合成後**的總倍率", () => {
    const world = new SimWorld(SKELETON_ARENA, 4242);
    const a = hero(world, "thorne", Z0.center.x, 0, 0);
    world.critRules = { ...world.critRules, maxTotalMult: 150 };
    twoSources(world, a, true, true); // 相乘 = 200 倍
    expect(rollCritStrike(world, a, 100, 1, false).amount).toBeCloseTo(15000, 6);
  });

  it("sourceCap 只留最強的前 N 條,而且被丟掉的那些連骰都不抽", () => {
    const world = new SimWorld(SKELETON_ARENA, 4242);
    const a = hero(world, "thorne", Z0.center.x, 0, 0);
    world.critRules = { ...world.critRules, sourceCap: 2, maxTotalMult: 100000 };
    // 插入序刻意「弱的先進」,好證明取捨看的是期望增益不是插入序。
    grant(world, a, { chance: 1, damageMult: 2, lifestealFraction: 0 }, "t:weak");
    grant(world, a, { chance: 1, damageMult: 5, lifestealFraction: 0 }, "t:mid");
    grant(world, a, { chance: 1, damageMult: 7, lifestealFraction: 0 }, "t:strong");
    const before = world.rng.state;
    const r = rollCritStrike(world, a, 100, 1, false);
    expect(r.amount).toBeCloseTo(3500, 6); // 7 × 5,弱的那條被丟掉

    // 兩次 draw,不是三次 —— 上限也是亂數預算的上界(檔頭 ③-b)。
    const twoDraws = new SimWorld(SKELETON_ARENA, 4242);
    const b = hero(twoDraws, "thorne", Z0.center.x, 0, 0);
    grant(twoDraws, b, { chance: 1, damageMult: 7, lifestealFraction: 0 }, "t:a");
    grant(twoDraws, b, { chance: 1, damageMult: 5, lifestealFraction: 0 }, "t:b");
    const before2 = twoDraws.rng.state;
    rollCritStrike(twoDraws, b, 100, 1, false);
    expect(world.rng.state).toBe(twoDraws.rng.state);
    expect(world.rng.state - before).toBe(twoDraws.rng.state - before2);
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

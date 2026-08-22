/**
 * #541【連段】+ #147【吸引】的**行為**守衛 —— 一支檔案守兩個機制。
 *
 * ⛔ 出貨數值一個都沒有進斷言（第二守則的「驗機制不驗數字」）：兩條都比的是
 * **同一次執行的另一半** —— 連段那條比「幾次獨立結算 / 落在幾個不同的 tick」，
 * 吸引那條比「有沒有抵達作者指定的落點」。夾具自己填的 3 / 20 / 50 是夾具的量，
 * ⛔ 不是 `content/config/` 裡的任何一格。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）─────────────────────────────────
 *  · ⭐ 承重線 —— `effects/comboStrikes.ts` 的 `atTick: world.tick + off`
 *    改成 `atTick: world.tick`（＝七段全部塞進同一個 tick，也就是這個 kind
 *    存在之前唯一寫得出來的東西）
 *      → 紅：「連段沒有分散在不同的 tick 上 —— 那在畫面上是「一下」不是連擊:
 *        expected 1 to be 4」
 *    ⚠️ 它同時擋住「整個班表沒排」與「排了但擠成一發」兩種壞法，而後者正是
 *      01-04 超究武神霸斬今天那份 `dot×2` 實作的形狀。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { DEFAULT_AUTO_ENGAGE } from "../combatFeel";
import { dist } from "../math/vec2";

beforeAll(() => registerSkeletonContent());
const C = SKELETON_ARENA.zones[0]!.center;

function stage(seed: number, offsets: readonly number[]): { world: SimWorld; caster: EntityId; bodies: EntityId[] } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  world.combatFeel = { ...world.combatFeel, autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false } };
  const caster = spawnChampion(world, {
    championId: SELA.id as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
    pos: { x: C.x, z: C.z }, zone: 0,
  });
  const bodies = offsets.map((dx, i) =>
    spawnChampion(world, {
      championId: SELA.id as ChampionId, seatId: asSeatId(i + 1), teamId: asTeamId(1),
      pos: { x: C.x + dx, z: C.z }, zone: 0,
    }),
  );
  world.step(new Map());
  return { world, caster, bodies };
}

function run(world: SimWorld, caster: EntityId, targets: EntityId[], effects: EffectDef[]): void {
  const ctx: EffectContext = { world, caster, rank: 1, targets, origin: "ability:test.combo", rng: world.rng };
  runEffects(effects, ctx);
}

const hit = (flat: number): EffectDef => ({ kind: "damage", amount: { flat }, damageType: "true" });

describe("#541 連段 comboStrikes", () => {
  it("N 段**各自**結算，落在 N 個不同的 tick 上，而收尾在它自己的那一發（⛔ 不重跑本體）", () => {
    cover("combo-strikes-independent-resolutions");
    const steps = [1 / 30, 4 / 30, 7 / 30]; // 夾具自己的節奏，⛔ 不是出貨值
    // ⚠️ 受害者刻意站遠 —— 近身時普攻／環境會多記一次掉血，而這一條數的是**次數**。
    const { world, caster, bodies } = stage(54100, [12]);
    const victim = bodies[0]!;
    run(world, caster, [victim], [
      {
        kind: "comboStrikes",
        shape: "single",
        steps: [...steps],
        perStrike: [hit(60)],
        // ⭐ 收尾刻意**比一般段輕** —— 這樣「收尾那一發有沒有連本體也跑一次」
        //    就是一個**方向**問題（輕 vs 重），⛔ 不必把任何一個數字寫進斷言。
        finisher: [hit(10)],
        finisherDelaySec: 6 / 30, // 收尾要有**自己的** tick
      },
    ]);

    const hp = world.health.get(victim)!;
    const drops: { tick: number; amount: number }[] = [];
    for (let i = 0; i < 24; i++) {
      const before = hp.hp;
      world.step(new Map());
      if (before - hp.hp > 1e-6) drops.push({ tick: i, amount: before - hp.hp });
    }

    // ⭐ 承重：N 段 + 收尾 = N+1 次**獨立**結算，而且每一次在不同的 tick。
    expect(
      drops.length,
      "連段沒有分散在不同的 tick 上 —— 那在畫面上是「一下」不是連擊",
    ).toBe(steps.length + 1);
    expect(new Set(drops.map((d) => d.tick)).size).toBe(drops.length);

    // 收尾在最後一段**之後**，而且那一發**只跑 finisher**（⛔ 不再跑一次本體）。
    const last = drops[drops.length - 1]!;
    const prev = drops[drops.length - 2]!;
    expect(last.tick, "收尾沒有自己的落點時刻（finisherDelaySec 被忽略了）").toBeGreaterThan(prev.tick + 1);
    expect(
      last.amount,
      "收尾那一發連本體也跑了一次（收尾比一般段輕，卻打得比較重）—— finisherOnly 沒有生效",
    ).toBeLessThan(prev.amount);
  });
});

describe("#147 吸引 pull", () => {
  it("身體被搬到**作者指定的落點**（等分錨點環），⛔ 不是被推一段固定長度", () => {
    cover("pull-arrives-at-authored-destination");
    const anchorRadius = 3;
    const { world, caster, bodies } = stage(54101, [7, -7]);
    run(world, caster, [], [
      {
        kind: "pull",
        shape: "circle",
        side: "enemies",
        radius: 12,
        destination: "anchorRing",
        anchorCount: 2,
        anchorRadius,
        speed: 12,
      },
    ]);
    for (let i = 0; i < 30; i++) world.step(new Map());

    const p0 = world.transform.get(bodies[0]!)!.pos;
    const p1 = world.transform.get(bodies[1]!)!.pos;
    // ⭐ 承重：兩具身體都**抵達**了環上（距離圓心 = 環半徑），⛔ 不是各自往圓心
    //    挪了一段長度 —— 後者正是 `knockback` 的 `from:"pull"` 會做的事。
    expect(dist(p0, C), "第一具身體沒有被搬到錨點環上").toBeCloseTo(anchorRadius, 0);
    expect(dist(p1, C), "第二具身體沒有被搬到錨點環上").toBeCloseTo(anchorRadius, 0);
    // 兩個人去**不同**的錨點（一人一格），⛔ 不是全部疊在同一點。
    expect(dist(p0, p1), "兩具身體被搬到同一個錨點上 —— 環退化成一個點").toBeGreaterThan(anchorRadius);
  });
});

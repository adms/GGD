/**
 * G10 + S4 + S9 —— status / buff 家族的**一條**承重守衛（2026-08-10）。
 * 三條都讀**最終世界狀態**（`hasStatus` / `sources` / `stacks`），⛔ 不是「Zod
 * 收不收得下」—— 那一種對「schema 開了但 handler 沒接」是全綠的（失敗形態⑤）。
 * ⛔ 沒有出貨數值進斷言：每一條比的都是**同一次執行的另一半**。
 *
 * 突變（整個 lane 一條）：`applyBuff.ts` 疊層路徑的
 * `...(e.statusId !== undefined ? { statusId: e.statusId } : {})` 關成 `false && …`
 * （＝標記不再騎在來源上，回到兩本帳）→ ① 紅，逐字：
 *   「AssertionError: 掛上了增益卻讀不到標記: expected false to be true」
 * ②③ 照樣綠（它們不問標記），所以紅的是**那一條機制**而不是整支夾具。改回來。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { runEffects } from "./effectRunner";
import { hasStatus } from "./effectCommon";
import { stackedBuffSourceId } from "./extendBuff";
import { combatResolveSystem } from "../combat/damage";
import { ModOp } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";
import type { EffectContext, EffectDef, TriggerDamage } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type StatusId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;
const RAGE = "test.rage" as StatusId;

function stage(seed: number): { world: SimWorld; a: EntityId; b: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  const mk = (seat: number, team: number, dx: number): EntityId =>
    spawnChampion(world, {
      championId: SELA.id as ChampionId,
      seatId: asSeatId(seat),
      teamId: asTeamId(team),
      pos: { x: C.x + dx, z: C.z },
      zone: 0,
    });
  const a = mk(0, 0, 0);
  const b = mk(1, 1, 2);
  world.step(new Map());
  return { world, a, b };
}

function run(
  world: SimWorld,
  caster: EntityId,
  targets: EntityId[],
  effects: EffectDef[],
  incoming?: TriggerDamage,
): void {
  const ctx: EffectContext = {
    world,
    caster,
    rank: 1,
    targets,
    origin: "ability:test.g10",
    rng: world.rng,
    ...(incoming ? { incoming } : {}),
  };
  runEffects(effects, ctx);
}

describe("G10 / S4 / S9 —— status·buff 家族", () => {
  it("G10：延長 buff 就是延長那個具名標記（兩本帳合成一個物件）", () => {
    const { world, a, b } = stage(101);
    const stackKey = "rage";
    const durationSec = 2;
    // 兩個身體吃**同一份**增益 —— 差別只有下面那一發延長。
    run(world, a, [a, b], [
      { kind: "applyBuff", stackKey, statusId: RAGE, duration: durationSec, modifiers: [] },
    ]);
    expect(hasStatus(world, a, RAGE), "掛上了增益卻讀不到標記").toBe(true);
    const untilTick = world.stats.get(b)!.sources.find((s) => s.id === stackedBuffSourceId(stackKey))!
      .expiresAtTick!;

    const hpLost = world.health.get(a)!.maxHp; // 一整條血 = 遠超門檻
    const ext: EffectDef = {
      kind: "extendBuff",
      shape: "single",
      stackKey,
      addSec: durationSec * 2,
      perDamagePctOfMaxHealth: 0.05,
      maxRemainingSec: durationSec * 10,
    };
    const hit: TriggerDamage = {
      raw: hpLost, mitigated: hpLost, hpLost, origin: "basic",
      reflectDepth: 0, resolvePass: 0, type: "physical", crit: false,
    };
    run(world, a, [a], [ext], hit);

    // 走到**原本**的到期點之後。沒被延長的那個身上什麼都不該剩。
    while (world.tick <= untilTick) world.step(new Map());
    expect(
      hasStatus(world, a, RAGE),
      "延長過的那個身體身上的標記不見了 —— 延長只碰到 buff，沒碰到 status（G10 的原始缺陷）",
    ).toBe(true);
    expect(hasStatus(world, b, RAGE), "沒被延長的那一份到期了卻還讀得到標記").toBe(false);
  });

  it("S4b：maxStat 真的擋得住再疊（沒填的那一半照樣一路長）", () => {
    const { world, a, b } = stage(102);
    const cap = 3;
    const applications = cap + 4; // 明確超過上限
    const perStack = { stat: Stat.AttackRange, op: ModOp.Flat, value: 1 };
    const capped: EffectDef = {
      kind: "applyBuff",
      stackKey: "capped",
      permanent: true,
      modifiers: [perStack],
      maxStat: { stat: Stat.AttackRange, value: cap, basis: "thisSource" },
    };
    const uncapped: EffectDef = {
      kind: "applyBuff",
      stackKey: "uncapped",
      permanent: true,
      modifiers: [perStack],
    };
    for (let i = 0; i < applications; i++) {
      run(world, a, [a], [capped]);
      run(world, a, [b], [uncapped]);
    }

    const stacksOf = (id: EntityId, key: string): number =>
      world.stats.get(id)!.sources.find((s) => s.id === stackedBuffSourceId(key))?.stacks ?? 0;
    // ⚠️ 比的是**同一次執行的另一半**，不是一個抄來的出貨數字。
    expect(stacksOf(b, "uncapped"), "沒填 maxStat 的那一半也被擋了 = 上限不是欄位在管").toBe(
      applications,
    );
    expect(stacksOf(a, "capped"), "填了 maxStat 卻一路疊上去 = 天花板沒有生效").toBe(cap);
  });

  it("S9：吞噬真的成功才跑後續，而後續增益落在施法者自己身上", () => {
    const line = 0.1;
    const apKey = "devour-ap";
    const devour: EffectDef = {
      kind: "devour",
      shape: "single",
      thresholdPctOfMax: [line],
      onDevour: [
        {
          kind: "applyBuff",
          // ⭐ S9b：目標是敵人，增益卻要落在自己身上 —— 沒有這一格就得拆兩條
          // hook，而兩條的機率與 ICD 各自獨立＝兩次判定不是一次。
          applyTo: "self",
          stackKey: apKey,
          permanent: true,
          modifiers: [{ stat: Stat.AbilityPower, op: ModOp.Flat, value: 1 }],
        },
      ],
    };
    const apStacks = (world: SimWorld, id: EntityId): number =>
      world.stats.get(id)!.sources.find((s) => s.id === stackedBuffSourceId(apKey))?.stacks ?? 0;

    // (a) 沒過處決線 → 後續**一次都不跑**。
    {
      const { world, a, b } = stage(103);
      const hp = world.health.get(b)!;
      hp.hp = hp.maxHp * line * 2;
      run(world, a, [b], [devour]);
      combatResolveSystem(world);
      expect(apStacks(world, a), "沒吞掉任何人，後續效果卻跑了 = 門檻與後續脫鉤").toBe(0);
    }
    // (b) 過線 → 跑了，而且落在施法者身上（目標是 b）。
    {
      const { world, a, b } = stage(104);
      const hp = world.health.get(b)!;
      hp.hp = hp.maxHp * line * 0.5;
      run(world, a, [b], [devour]);
      combatResolveSystem(world);
      expect(apStacks(world, a), "真的吞掉了，後續增益卻沒落在施法者身上").toBe(1);
      expect(apStacks(world, b), "後續增益落到了被吞的人身上 = applyTo 沒接上").toBe(0);
    }
  });
});

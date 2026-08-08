/**
 * Lane 2（2026-08-08）三個新 effect kind 的**行為**守衛。
 *
 * 一支檔案守三個 kind，理由與 `lane1Kinds.test.ts` 逐字相同：它們是**同一個形狀
 * 的三個實例**（`shape` + 決策欄位 + 一個 handler，界共用 `kindLimits.ts`）。
 *
 * ⚠️ 每一條讀的都是**最終世界狀態**（落點座標 / `hp.mana` / `expiresAtTick` /
 * `rng.state`），不是「EffectDef 長什麼樣」。出貨數值一個都沒有進斷言。
 *
 * ── ⛔ 誠實標注：兩個 kind 的**接線還沒接** ────────────────────────────────
 * `randomAreaSystem` 還沒被掛進 `SimWorld.step()`、`manaBarrierCutFor` 還沒被
 * `combat/damage.ts` 呼叫（那兩支檔案屬於別的並行路）。所以下面驗的是**機制**，
 * 不是「玩家真的拿得到」—— 那正是 CLAUDE.md 失敗形態 ⑤ 的形狀，寫在這裡是為了
 * 讓它**不能**被誤讀成「做完了」。要接的兩行寫在各自的檔頭（randomArea ④ /
 * manaBarrier ②）與交接回報裡。
 *
 * ── 突變紀錄（四個都真的跑過：改壞 → 紅 → 改回來，訊息逐字抄在下面）─────────
 *  · ⭐ 承重線 —— draw 預算：`rollScatterPoints` 的第二次 `rng.next()` 拿掉
 *    （`const z = x`，＝一發只抽一次）
 *      → 紅：「施法沒有剛好花掉 2×count 次 draw: expected 2419721094 to be 524214084」
 *    ⚠️ 這一條同時擋住「到期時才抽」那個實作：那樣施法當下是 **0** 次 draw，
 *      同一行一樣紅。它是這個 kind 的決定性契約，不是一個順手的斷言。
 *  · 排程：`atTick: world.tick + firstOffset + i * intervalTicks` 的
 *    `+ i * intervalTicks` 拿掉（＝整波塞進同一個 tick）
 *      → 紅（「落點沒有被排開」那一條）。
 *  · `manaBarrierCutFor` 的 `hp.mana -= absorbed / perMana` 改成
 *    `hp.mana -= absorbed`（＝忘了匯率）
 *      → 紅：「扣的魔力不等於 傷害÷匯率 —— 匯率沒有被讀到: expected 12 to be close to 4」
 *  · `extendBuff` 的 `Math.min(capTicks, …)` 拿掉
 *      → 紅：「延長後的剩餘時間超過了 maxRemainingSec: expected 60240 to be <= 300」
 *        （＝狂怒被一發爆表傷害延長成 33 分鐘）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { attachSource } from "../stats/statPipeline";
import { runEffects } from "./effectRunner";
import { randomAreaSystem, randomAreaDrawBudget } from "./randomArea";
import { manaBarrierCutFor, type ManaBarrierSource } from "./manaBarrier";
import { stackedBuffSourceId } from "./extendBuff";
import type { EffectContext, EffectDef, TriggerDamage } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

function stage(seed: number): { world: SimWorld; caster: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  const caster = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + 2, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return { world, caster };
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
    origin: "ability:test.lane2",
    rng: world.rng,
    ...(incoming ? { incoming } : {}),
  };
  runEffects(effects, ctx);
}

describe("Lane 2 的三個 effect kind", () => {
  it("randomArea：同 seed → 同一組落點與同一組到期 tick（落點在施法時抽完）", () => {
    cover("ra-same-seed-same-points");
    const count = 6;
    const barrage: EffectDef = {
      kind: "randomArea",
      shape: "single",
      count: [count],
      intervalSec: 0.2,
      scatterRadius: 5,
      // payload 不重要：這一條驗的是排程，不是傷害。
      effects: [{ kind: "spawnVfx", vfxId: "test.meteor" }],
    };

    // 兩個世界、同一顆 seed，但**推進的 tick 數不同** —— 這一半是承重的：
    // 「到期時才抽落點」的實作在這裡就會分岔，而它對「單跑一次」的斷言照樣過。
    const shot = (extraSteps: number): { pts: string[]; ticks: number[] } => {
      const { world, caster } = stage(20260808);
      const before = world.rng.state;
      run(world, caster, [caster], [barrage]);
      // ① draw 預算是**輸入的函式**：2 × count，一次抽完。
      const probe = new SimWorld(SKELETON_ARENA, 0);
      probe.rng.state = before;
      for (let i = 0; i < randomAreaDrawBudget(count); i++) probe.rng.next();
      expect(world.rng.state, "施法沒有剛好花掉 2×count 次 draw").toBe(probe.rng.state);

      for (let i = 0; i < extraSteps; i++) {
        world.step(new Map());
        randomAreaSystem(world);
      }
      // 讀出這一波剩下的落點（system 還沒接進 step()，所以手動跑，見檔頭）。
      const q = (world as unknown as { randomArea?: { impacts: { atTick: number; pos: { x: number; z: number } }[] }[] })
        .randomArea!;
      const impacts = q[0]!.impacts;
      return {
        pts: impacts.map((p) => `${p.pos.x.toFixed(6)},${p.pos.z.toFixed(6)}`),
        ticks: impacts.map((p) => p.atTick),
      };
    };

    const a = shot(0);
    const b = shot(4);
    expect(a.pts.length).toBe(count);
    expect(b.pts, "同 seed 的落點不一致 = 落點不是在施法時抽的").toEqual(a.pts);
    expect(b.ticks, "同 seed 的到期 tick 不一致").toEqual(a.ticks);
    // ② 間隔真的是等差（排程用的是絕對 tick，不是「有空就一起放」）。
    const gaps = a.ticks.slice(1).map((t, i) => t - a.ticks[i]!);
    expect(new Set(gaps).size, "落點沒有被排開 —— 整波塞在同一個 tick").toBe(1);
    expect(gaps[0]!).toBeGreaterThan(0);
  });

  it("manaBarrier：抵掉的傷害從**魔力**扣，而且抵不完的部分原封不動往下走", () => {
    cover("mb-spends-mana-not-hp");
    const { world, caster } = stage(7);
    const hp = world.health.get(caster)!;
    const perMana = 3;
    // 夾具自己造的量：只給一小池魔力，讓「抵不完」那一半可觀察。
    hp.mana = 10;
    const src: ManaBarrierSource = {
      id: "buff:manaBarrier:test",
      kind: "buff",
      expiresAtTick: world.tick + 300,
      manaBarrier: { perMana, damageTypes: ["physical", "magic", "true"] },
    };
    attachSource(world, caster, src);

    // ① 池子吃得下的一發：全額抵掉，扣掉的魔力 = 傷害 ÷ 匯率。
    const small = perMana * 4;
    const manaBefore = hp.mana;
    const cutSmall = manaBarrierCutFor(world, caster, "physical", small);
    expect(cutSmall, "屏障沒有把這一發整包吃掉").toBeCloseTo(small, 6);
    expect(manaBefore - hp.mana, "扣的魔力不等於 傷害÷匯率 —— 匯率沒有被讀到").toBeCloseTo(
      small / perMana,
      6,
    );

    // ② ⛔ 這一半才是重點：魔力見底之後**剩下的傷害要留給血條**，
    //    而不是被靜默吃掉（那就變成無敵）。
    const poolBefore = hp.mana;
    const huge = poolBefore * perMana + 100;
    const cutHuge = manaBarrierCutFor(world, caster, "physical", huge);
    expect(cutHuge, "抵掉的量超過魔力池換得到的上限").toBeCloseTo(poolBefore * perMana, 6);
    expect(huge - cutHuge, "抵不完的殘量沒有留下來 = 這一發被吞掉了").toBeGreaterThan(0);
    expect(hp.mana, "魔力沒有被抵到見底").toBeCloseTo(0, 6);

    // ③ `damageTypes` 真的是一格會被讀到的欄位（不是程式裡的一個 if）。
    hp.mana = 10;
    src.manaBarrier = { perMana, damageTypes: ["magic"] };
    expect(
      manaBarrierCutFor(world, caster, "physical", perMana * 2),
      "型別不在名單裡卻仍然擋了",
    ).toBe(0);
    expect(hp.mana, "型別不合卻扣了魔力").toBeCloseTo(10, 6);
  });

  it("extendBuff：受傷延長既有 buff，而上界真的擋得住（正回饋不會變永久）", () => {
    cover("eb-cap-is-load-bearing");
    const { world, caster } = stage(11);
    const hpc = world.health.get(caster)!;
    const stackKey = "berserk-test";
    const startExpiry = world.tick + Math.round(6 / world.dt);
    attachSource(world, caster, {
      id: stackedBuffSourceId(stackKey),
      kind: "buff",
      expiresAtTick: startExpiry,
      stacks: 1,
    });
    const src = world.stats.get(caster)!.sources.find((s) => s.id === stackedBuffSourceId(stackKey))!;

    const pct = 0.05;
    const addSec = 2;
    const capSec = 10;
    const ext: EffectDef = {
      kind: "extendBuff",
      shape: "single",
      stackKey,
      addSec,
      perDamagePctOfMaxHealth: pct,
      maxRemainingSec: capSec,
    };
    const threshold = hpc.maxHp * pct;
    const incoming = (hpLost: number): TriggerDamage => ({
      raw: hpLost,
      mitigated: hpLost,
      hpLost,
      origin: "basic",
      reflectDepth: 0,
      resolvePass: 0,
      type: "physical",
      crit: false,
    });

    // ⚠️ 先驗**沒有那一發**的那一半：它必須一 tick 都不延長。
    run(world, caster, [caster], [ext]);
    expect(src.expiresAtTick, "沒有 incoming 卻仍然延長了").toBe(startExpiry);

    // ① 剛好一份門檻 → 剛好 addSec。從夾具推導，不抄任何出貨數值。
    run(world, caster, [caster], [ext], incoming(threshold));
    expect(src.expiresAtTick! - startExpiry).toBe(Math.round(addSec / world.dt));

    // ② ⭐ 承重線：一發打爆表的傷害不可以把 buff 延長成無限 ——
    //    上界釘的是**延長後的剩餘時間**。
    run(world, caster, [caster], [ext], incoming(threshold * 1000));
    expect(
      src.expiresAtTick! - world.tick,
      "延長後的剩餘時間超過了 maxRemainingSec = 上界沒有生效",
    ).toBeLessThanOrEqual(Math.round(capSec / world.dt));
  });
});

/**
 * Lane 3（2026-08-10）四個新機制的**行為**守衛：
 * G12 `delayed` · S5 `proxyCast` · S6 hook 額度 · S7 `dash.onEnd`。
 *
 * 一支檔案守四個，理由與 `lane1Kinds.test.ts` / `lane2Kinds.test.ts` 逐字相同：
 * 它們是同一批、同一個接縫（effect kind / hook 欄位 + 一個 handler），界共用
 * `kindLimits.ts`。⚠️ 每一條讀的都是**最終世界狀態**（`hp.hp` 掉在哪幾個 tick、
 * 來源還在不在），不是「EffectDef 長什麼樣」—— 只驗 schema 的斷言對「schema
 * 開了但 handler 沒接」是全綠的（失敗形態⑤）。
 * ⛔ 出貨數值一個都沒有進斷言：每一條比的都是**同一次執行的另一半**
 *（有 vs 沒有、maxDepth 0 vs 3、onEnd vs 同一個 effects[]）。
 *
 * ── 突變紀錄（整個 lane 一條承重的線，真的跑過：改壞 → 紅 → 訊息逐字抄下）───
 *  · ⭐ 承重線 —— `effects/dashOnEnd.ts` 的
 *      `point: { x: t.pos.x, z: t.pos.z }`（衝刺**終點**）
 *    改成 `point: { x: p.from.x, z: p.from.z }`（＝退回今天那個缺陷：從起點揮出）
 *      → 紅：「衝刺結束的那一刀沒有打到終點的人 —— 圓心還是起點:
 *        expected 0 to be greater than 0」
 *    ⚠️ 這一條同時擋住「整個 onEnd 沒接上」與「接上了但圓心取錯」兩種壞法，
 *      而後者正是 S7 存在的**全部理由**（實測：dash 單獨 43.47 / dash+AoE 同一個
 *      effects[] 也是 43.47 —— 逐字相同，那一刀完全落空）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { attachSource } from "../stats/statPipeline";
import { Abilities } from "../content/registry";
import { runEffects } from "./effectRunner";
import { fireHooks } from "./hooks";
import type { EffectContext, EffectDef } from "./effect";
import type { HookDef } from "../stats/modifiers";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../../ids";
import { DEFAULT_AUTO_ENGAGE } from "../combatFeel";

/** 品牌型別的字面量投射（`content/skeleton.ts` 的同一個一行工具）。 */
const id = <T extends string>(s: string): T => s as T;

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

/** 施法者在圓心，受害者在他右邊 `dx` 單位。 */
function stage(seed: number, dx = 2): { world: SimWorld; caster: EntityId; victim: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  // ⛔ 關掉自動索敵 —— 但它**不是**唯一的環境掉血來源（S7 那條量到過一份不是
  // 那一刀的 43.47），所以那一條仍然用**三臂相減**而不是「等於 0」。
  world.combatFeel = {
    ...world.combatFeel,
    autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false },
  };
  const caster = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const victim = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + dx, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return { world, caster, victim };
}

function run(world: SimWorld, caster: EntityId, targets: EntityId[], effects: EffectDef[]): void {
  const ctx: EffectContext = {
    world,
    caster,
    rank: 1,
    targets,
    origin: "ability:test.lane3",
    rng: world.rng,
  };
  runEffects(effects, ctx);
}

/** 逐 tick 推進，回報**哪幾個 tick** 這個身體掉了血、各掉多少。 */
function hpDropsOverTicks(world: SimWorld, body: EntityId, ticks: number): number[] {
  const hp = world.health.get(body)!;
  const drops: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const before = hp.hp;
    world.step(new Map());
    const d = before - hp.hp;
    if (d > 1e-6) drops.push(d);
  }
  return drops;
}

const hit = (flat: number): EffectDef => ({ kind: "damage", amount: { flat }, damageType: "true" });

describe("Lane 3 的四個機制", () => {
  it("G12 delayed：名單在**施放那一刻**凍住，而且分散在不同的 tick 上落下", () => {
    cover("delayed-frozen-list-and-absolute-ticks");
    const { world, caster, victim } = stage(31200);
    // 圓形凍結：施放時受害者在半徑內。夾具自己選的量，不是出貨值。
    const strikes = 3;
    run(world, caster, [], [
      {
        kind: "delayed",
        shape: "circle",
        side: "enemies",
        radius: 4,
        delaySec: 2 / 30,
        count: strikes,
        intervalSec: 3 / 30,
        effects: [hit(20)],
        // 「最後一擊附加⋯」—— 最後那一發要比前面重，這是同一次執行的另一半。
        finalEffects: [hit(20)],
      },
    ]);

    // ⭐ 走開。「到期重解」的實作（＝`randomArea` 的語意）在這裡就會全部打空。
    world.transform.get(victim)!.pos = { x: C.x + 30, z: C.z };

    const drops = hpDropsOverTicks(world, victim, 20);
    expect(drops.length, "延遲序列一發都沒落下 —— 或者到期時重解了目標（走開就打空）").toBe(
      strikes,
    );
    // 排程是絕對 tick：三發不可以擠在同一個 tick（那在畫面上是「一下」不是連擊）。
    expect(drops[drops.length - 1]!, "最後一發沒有比前面重 —— finalEffects 沒有被跑").toBeGreaterThan(
      drops[0]!,
    );
  });

  it("S5 proxyCast：代放的是**那一支技能自己的 payload**，而且鏈一定會停", () => {
    cover("proxycast-runs-target-payload-and-terminates");
    // A 代放 B、B 代放 A —— 相互遞迴，終止性靠深度嚴格遞增 + 上界。
    const mk = (self: string, other: string, maxDepth: number): void => {
      Abilities.register(id<AbilityId>(self), {
        id: id<AbilityId>(self),
        name: self,
        slot: "Q",
        castType: "self",
        maxRank: 1,
        cooldown: [0],
        manaCost: [0],
        range: 0,
        effects: [
          hit(10),
          {
            kind: "proxyCast",
            shape: "single",
            abilityId: id<AbilityId>(other),
            requireLearned: false,
            maxDepth,
          },
        ],
      });
    };

    const totalFor = (maxDepth: number): number => {
      mk("test.proxy-a", "test.proxy-b", maxDepth);
      mk("test.proxy-b", "test.proxy-a", maxDepth);
      const { world, caster, victim } = stage(3155);
      const hp = world.health.get(victim)!;
      const before = hp.hp;
      // ⭐ 走**出貨的** apply：`runEffects` → registry → proxyCast handler。
      run(world, caster, [victim], Abilities.get(id<AbilityId>("test.proxy-a")).effects);
      world.step(new Map());
      return before - hp.hp;
    };

    const shallow = totalFor(0);
    const deep = totalFor(3);
    expect(shallow, "代放什麼都沒做 —— 目標技能的 effects 沒有被跑").toBeGreaterThan(0);
    // 深度真的被往下傳（`proxyDepth: depth + 1` 少了那一行，maxDepth 0 這一臂
    // 會無限遞迴 —— 這條斷言連同「跑得完」一起是終止性的觀察面。
    expect(deep, "加深上界之後代放鏈沒有變長 = 深度沒有在遞增").toBeGreaterThan(shallow);
  });

  it("S6 hook 額度：`maxTriggers` 讓「下一次普攻」真的只有一次", () => {
    cover("hook-max-triggers-consumes");
    const swing = (maxTriggers?: number): number[] => {
      const { world, caster, victim } = stage(1504);
      const hook: HookDef = {
        on: "onBasicAttack",
        effects: [hit(25)],
        ...(maxTriggers !== undefined ? { maxTriggers, onConsumed: "detachSource" as const } : {}),
      };
      attachSource(world, caster, { id: "buff:test-nextswing", kind: "buff", hooks: [hook] });
      const hp = world.health.get(victim)!;
      const drops: number[] = [];
      for (let i = 0; i < 2; i++) {
        const before = hp.hp;
        fireHooks(world, caster, "onBasicAttack", victim);
        world.step(new Map());
        const d = before - hp.hp;
        if (d > 1e-6) drops.push(d);
      }
      // `onConsumed: "detachSource"` —— 額度用完整份來源卸下（圖示跟著消失）。
      const stillAttached = world.stats
        .get(caster)!
        .sources.some((s) => s.id === "buff:test-nextswing");
      if (maxTriggers !== undefined) {
        expect(stillAttached, "額度用完了來源還掛在身上 = onConsumed 沒有被讀到").toBe(false);
      }
      return drops;
    };

    // 同一件事的兩半：沒填額度 = 無限次（今天）；填 1 = 只有第一次。
    expect(swing(undefined).length, "沒填 maxTriggers 卻不是每次都觸發（既有行為被改動了）").toBe(2);
    expect(swing(1).length, "填了 maxTriggers: 1 卻觸發了不只一次 —— 卡上寫的是「下一次」").toBe(1);
  });

  it("S7 dash.onEnd：那一刀從衝刺**終點**揮出，不是起點", () => {
    cover("dash-on-end-swings-at-the-endpoint");
    const dashDistance = 6;
    // 受害者放在**終點**附近，起點碰不到他 —— 這正是實測到的那個缺陷的形狀。
    const blast: EffectDef = { kind: "damageArea", amount: { flat: 40 }, radius: 2, damageType: "true" };
    const dashTo = (effects: EffectDef[]): number => {
      const { world, caster, victim } = stage(5204, dashDistance);
      const hp = world.health.get(victim)!;
      const before = hp.hp;
      const ctx: EffectContext = {
        world,
        caster,
        rank: 1,
        targets: [],
        direction: { x: 1, z: 0 },
        origin: "ability:test.lane3",
        rng: world.rng,
      };
      runEffects(effects, ctx);
      for (let i = 0; i < 30; i++) world.step(new Map());
      return before - hp.hp;
    };

    const dash = (extra: Partial<Extract<EffectDef, { kind: "dash" }>>): EffectDef => ({
      kind: "dash",
      mode: "forward",
      speed: 20,
      maxDistance: dashDistance,
      ...extra,
    });

    // ⭐ 三臂，逐字照著實測那三行（`effect.ts` 的 `dash.onEnd` 檔頭）：
    //   dash 單獨 / dash + 同一個 effects[] 裡的 AoE / dash + onEnd。
    // 相減是必要的：這個世界還有一份與那一刀無關的環境掉血，直接斷言「等於 0」
    // 會把它讀成「打中了」（失敗形態④）。
    const dashOnly = dashTo([dash({})]);
    const sameTick = dashTo([dash({}), blast]);
    const onEnd = dashTo([dash({ onEnd: [blast] })]);

    expect(sameTick, "對照組居然打中了 —— 夾具沒有重現「從起點揮出會落空」").toBe(dashOnly);
    expect(onEnd - dashOnly, "衝刺結束的那一刀沒有打到終點的人 —— 圓心還是起點").toBeGreaterThan(
      0,
    );
  });
});

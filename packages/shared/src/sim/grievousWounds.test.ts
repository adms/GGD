/**
 * 【重創】的行為守衛（A6，#278）。owner 裁決⑥：**三格獨立倍率，預設全部 0.5**。
 *
 * ── 四條，而第四條才是這一批真正的風險 ──────────────────────────────────
 *
 *  ①  治療真的被打折（`healTarget` 那條路）。
 *  ②  吸血那一半**也**被打折 —— 這條在防「做一半而看起來像做完」。
 *  ③  ⭐ 自然回復**也**被打折。⛔ 最容易被漏掉的一條：regen 不經過
 *      `healTarget`，所以只改治療那條路會讓它靜默地不生效（失敗形態 ②）。
 *  ④  ⛔ 吸血**不可以被打折兩次**。吸血最後是一發 `healTarget`，所以
 *      `healingTakenMult` 已經會咬到它；`lifestealMult` 必須作用在**係數**
 *      那一步。做錯的話帶重創的人吸血是 0.25 倍而不是 0.5 倍 ——
 *      而那在畫面上只是「好像有點少」，沒有人會發現。
 *
 * ⚠️ **倍率一律從測試自己建的 status 讀，不抄 0.5 這個字面值**
 *（CLAUDE.md：出貨數值住進測試＝第四個住處，而 owner 每週在改它們）。
 *
 * 突變紀錄（都真的做過，見 commit message）:
 *   · `healTarget` 的 `woundMult(...)` 拿掉      → gw-heal 紅
 *   · 吸血係數的 `woundMult(...)` 拿掉           → gw-lifesteal 紅
 *   · `RegenSystem` 的 `woundMult(...)` 拿掉     → gw-regen 紅
 *   · 吸血係數改成也乘 `healingTakenMult`        → gw-no-double 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { healTarget } from "./combat/restore";
import { combatResolveSystem } from "./combat/damage";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import type { StatusEffect } from "./components";

/** 一份重創的三格 —— 三條測試共用同一份，所以斷言之間不會偷偷用不同的數。 */
const WOUND = { healingTakenMult: 0.4, lifestealMult: 0.25, regenMult: 0.6 } as const;

const C = SKELETON_ARENA.zones[0]!.center;

beforeAll(() => registerSkeletonContent());

function stage(): { world: SimWorld; hero: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 9);
  world.combatActive = true;
  const hero = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  // 挖一個坑,否則治療會被 maxHp 夾掉而兩邊都量到同一個數。
  const hp = world.health.get(hero)!;
  hp.hp = hp.maxHp * 0.2;
  return { world, hero };
}

function wound(world: SimWorld, id: EntityId, fields: Partial<StatusEffect>): void {
  const st = world.status.get(id) ?? { effects: [] };
  st.effects.push({
    statusId: "grievous-wounds" as StatusEffect["statusId"],
    sourceId: "src:test",
    expiresAtTick: world.tick + 900,
    ...fields,
  });
  world.status.set(id, st);
}

describe("重創 —— 三格獨立倍率（A6）", () => {
  it("① 治療真的被打折", () => {
    cover("gw-heal");
    const clean = stage();
    const healthy = healTarget(clean.world, {
      source: clean.hero,
      target: clean.hero,
      amount: 100,
      origin: "test",
      score: false,
    });

    const hurt = stage();
    wound(hurt.world, hurt.hero, { healingTakenMult: WOUND.healingTakenMult });
    const wounded = healTarget(hurt.world, {
      source: hurt.hero,
      target: hurt.hero,
      amount: 100,
      origin: "test",
      score: false,
    });

    expect(healthy).toBeGreaterThan(0); // 夾具前提：沒帶重創時真的回得到血
    expect(wounded).toBeCloseTo(healthy * WOUND.healingTakenMult, 6);
  });

  it("③ ⭐ 自然回復也被打折（它不經過 healTarget）", () => {
    cover("gw-regen");
    const readHp = (w: SimWorld, id: EntityId): number => w.health.get(id)!.hp;

    const clean = stage();
    const c0 = readHp(clean.world, clean.hero);
    for (let i = 0; i < 30; i++) clean.world.step(new Map());
    const cleanGain = readHp(clean.world, clean.hero) - c0;

    const hurt = stage();
    wound(hurt.world, hurt.hero, { regenMult: WOUND.regenMult });
    const h0 = readHp(hurt.world, hurt.hero);
    for (let i = 0; i < 30; i++) hurt.world.step(new Map());
    const hurtGain = readHp(hurt.world, hurt.hero) - h0;

    expect(cleanGain).toBeGreaterThan(0); // 夾具前提：自然回復真的在跑
    // ⚠️ 斷言是「嚴格小於」而不是「等於 0.6 倍」：這一格走的是每 tick 的
    // 累加，而 regen 本身還吃 `combatEnv.healthRegen` 與 `regenRules` 的地板。
    // 釘倍率等於把那兩個也釘住了 —— 而它們是 owner 在調的東西。
    expect(hurtGain).toBeLessThan(cleanGain);
  });

  it("② 吸血那一半也被打折 —— 而且 ④ ⛔ 不可以打折兩次", () => {
    cover("gw-lifesteal");
    cover("gw-no-double");
    // ⛔ 這一條**一定要走出貨的傷害管線**。第一版我在測試裡自己手算
    // 「先乘 lifestealMult 再交給 healTarget」,於是「吸血打折兩次」那個突變
    // 完全打不到它 —— 那正是它要抓的失敗形態 ⑤（被測的不是出貨的那個）。
    //
    // 吸血 = 係數那一步乘 `lifestealMult`,落地那一步乘 `healingTakenMult`。
    // 兩格**都填**,所以一個「在係數那一步也乘 healingTakenMult」的實作
    // 會多打一次折 → 下面的等式紅。
    const LS = 0.5; // 吸血率。只影響絕對值,兩邊都一樣,所以不是被驗的數字。

    function lifestealGain(withWound: boolean): number {
      const { world, hero } = stage();
      const foe = spawnChampion(world, {
        championId: SELA.id as ChampionId,
        seatId: asSeatId(1),
        teamId: asTeamId(1),
        pos: { x: C.x + 2, z: C.z },
        zone: 0,
      });
      world.step(new Map());
      const sc = world.stats.get(hero)!;
      sc.final[Stat.Lifesteal] = LS;
      if (withWound) {
        wound(world, hero, {
          healingTakenMult: WOUND.healingTakenMult,
          lifestealMult: WOUND.lifestealMult,
        });
      }
      const before = world.health.get(hero)!.hp;
      world.damageQueue.push({
        source: hero,
        target: foe,
        amount: 100,
        type: "physical",
        crit: false,
        origin: "basic",
      });
      combatResolveSystem(world);
      return world.health.get(hero)!.hp - before;
    }

    const healthy = lifestealGain(false);
    const wounded = lifestealGain(true);

    expect(healthy).toBeGreaterThan(0); // 夾具前提:吸血真的在跑
    // ② 有打折
    expect(wounded).toBeLessThan(healthy);
    // ④ **恰好**兩格各乘一次 —— 不是 `healingTakenMult` 乘兩次。
    //    倍率從 WOUND 讀,不是字面值。
    expect(wounded).toBeCloseTo(healthy * WOUND.lifestealMult * WOUND.healingTakenMult, 6);
  });

  it("多筆重創預設取 max（最重的那一筆），可切成相乘", () => {
    cover("gw-stack-mode");
    const base = 100;

    const maxWorld = stage(); // 出貨預設 stackMode = "max"
    wound(maxWorld.world, maxWorld.hero, { healingTakenMult: 0.8 });
    wound(maxWorld.world, maxWorld.hero, { healingTakenMult: 0.5 });
    const maxHealed = healTarget(maxWorld.world, {
      source: maxWorld.hero,
      target: maxWorld.hero,
      amount: base,
      origin: "test",
      score: false,
    });

    const mulWorld = stage();
    mulWorld.world.woundRules = { stackMode: "multiply" };
    wound(mulWorld.world, mulWorld.hero, { healingTakenMult: 0.8 });
    wound(mulWorld.world, mulWorld.hero, { healingTakenMult: 0.5 });
    const mulHealed = healTarget(mulWorld.world, {
      source: mulWorld.hero,
      target: mulWorld.hero,
      amount: base,
      origin: "test",
      score: false,
    });

    // max 取 0.5；multiply 取 0.4 → 相乘那邊一定回得比較少。
    expect(maxHealed).toBeGreaterThan(mulHealed);
    expect(mulHealed).toBeCloseTo(maxHealed * 0.8, 6);
  });
});

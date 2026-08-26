/**
 * 不變量守衛：`Health.mana` **永遠 ≥ 0**（GH#733，接手 #185 的 `-344/825`）。
 *
 * ⚠️ 這一支驗的是**機制**（「有沒有底」），⛔ 不是數字：測試裡沒有任何一個出貨值
 * （回魔速率、上限、秒數）—— 那些已經有三個住處＋drift 測試在守。
 *
 * ⭐ 走的是**真的 `world.step()`**，⛔ 不直接呼叫 `flooredMana`：那支純函式測起來
 * 永遠會過，就算 `RegenSystem` 那一行被改回 `Math.min(maxMana, …)` 也一樣
 *（失敗形態③：整段接線可以撤銷而測試全綠）。
 *
 * ⭐ **承重的那一條是第一條** —— 負回魔。#733 的 body 猜的是施法路徑
 *（`abilitySystem:694`），但今天逐行量到那條路被 `:594` 的 `hp.mana < mana` 擋著；
 * 真的把池子扣穿的是 `RegenSystem`：`Stat.ManaRegen` 收得下**負的 flat 加成**，
 * 而出貨 `enforceFloor:false` 讓 `manaRegenPerSec()` 原樣把負數送出來。
 * 突變：把 `RegenSystem` 的 `flooredMana(...)` 換回 `Math.min(hp.maxMana, …)` ⇒ 第一條紅。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type EntityId } from "../ids";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { attachSource, recomputeStats } from "./stats/statPipeline";

const Z0 = SKELETON_ARENA.zones[0]!;

function arena(): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const id = spawnChampion(world, {
    championId: SELA.id,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { ...Z0.center },
    zone: 0,
  });
  return { world, id };
}

beforeEach(() => {
  // ⚠️ ⛔ 不要先 `Champions.clear()`（`registerSkeletonContent` 只跑一次）。
  registerSkeletonContent();
});

describe("魔力不變量 —— mana 永遠 ≥ 0 (GH#733)", () => {
  it("⭐ 承重：**負的**回魔把池子抽乾之後停在 0，⛔ 不會繼續往下扣", () => {
    const { world, id } = arena();
    const hp = world.health.get(id)!;
    // 「負回魔」是引擎收得下的狀態（`content/skeleton.ts:53` 記著一個天然的
    // −0.22 例子）。這裡用一件給負 flat 的 buff 造出它 —— ⛔ 不抄任何出貨值，
    // 只要求它把 `Stat.ManaRegen` 推到 0 以下。
    attachSource(world, id, {
      id: "t:mana-drain",
      kind: "buff",
      modifiers: [{ stat: Stat.ManaRegen, op: ModOp.Flat, value: -500 }],
    });
    recomputeStats(world, id);
    expect(world.stats.get(id)!.final[Stat.ManaRegen]).toBeLessThan(0);

    for (let k = 0; k < 300; k++) world.step(new Map());

    expect(hp.mana).toBe(0);
  });

  it("⛔ 對照組：沒有那件 buff 時同一段時間魔力**不是** 0 —— 上面那條驗的是地板不是「回魔壞了」", () => {
    const { world, id } = arena();
    const hp = world.health.get(id)!;
    hp.mana = 0;
    for (let k = 0; k < 300; k++) world.step(new Map());
    expect(hp.mana).toBeGreaterThan(0);
  });

  it("⭐ 放大器：`maxMana` 變動時的「保持比例」不會把一個見底的池子翻成負數", () => {
    const { world, id } = arena();
    const hp = world.health.get(id)!;
    hp.mana = 0;
    // 上限長大（任何一件加 maxMana 的道具都會走到這條路）。
    attachSource(world, id, {
      id: "t:big-pool",
      kind: "buff",
      modifiers: [{ stat: Stat.MaxMana, op: ModOp.Flat, value: 400 }],
    });
    recomputeStats(world, id);
    expect(hp.mana).toBeGreaterThanOrEqual(0);
  });
});

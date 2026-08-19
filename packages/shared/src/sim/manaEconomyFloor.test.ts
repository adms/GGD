/**
 * 回魔地板（GH#446）的守衛。
 *
 * owner 2026-08-19：「**平均回魔不超過 15 秒就可以滿魔再一輪**」。
 *
 * ⭐ 驗的是**機制會不會發生**（空魔的英雄在 `refillSeconds` 內回滿），
 * ⛔ 不驗「15 是不是對的數字」—— 那一格住 `content/config/mana-economy.json`
 * + Zod `DEFAULT_*` + 後台，三者之間已經有 drift 測試在守。
 *
 * ⚠️ 走的是**真的 `world.step()`**，⛔ 不是直接呼叫 `manaRegenPerSec`：
 * 那支純函式測起來永遠會過，就算 `RegenSystem` 那一行被改回
 * `sc.final[Stat.ManaRegen]` 也一樣（失敗形態③：整段接線可以撤銷而測試全綠）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId } from "../ids";
import { DEFAULT_MANA_ECONOMY } from "./manaEconomy";

const Z0 = SKELETON_ARENA.zones[0]!;

function arena(): { world: SimWorld; id: ReturnType<typeof spawnChampion> } {
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

/** 把魔力抽乾，跑 N 秒，回傳最後的魔力比例。 */
function refillRatio(world: SimWorld, id: ReturnType<typeof spawnChampion>, sec: number): number {
  const hp = world.health.get(id)!;
  hp.mana = 0;
  for (let k = 0; k < Math.round(sec / world.dt); k++) world.step(new Map());
  return hp.mana / hp.maxMana;
}

beforeEach(() => {
  // ⚠️ ⛔ 不要先 `Champions.clear()` —— `registerSkeletonContent` 有一個
  //    「只跑一次」的旗標，清掉之後它就再也不會補回來（第二個 it 會拿到空表）。
  registerSkeletonContent();
});

describe("回魔地板 (GH#446)", () => {
  it("⭐ 空魔的英雄在「滿魔秒數」之內回滿 —— 出貨規則真的跑在 RegenSystem 上", () => {
    const { world, id } = arena();
    expect(world.manaEconomy).toEqual(DEFAULT_MANA_ECONOMY);
    expect(refillRatio(world, id, DEFAULT_MANA_ECONOMY.refillSeconds)).toBeGreaterThan(0.99);
  });

  it("⛔ 關掉總開關 = 逐位元回到今天的行為（同一段時間回不滿）", () => {
    const { world, id } = arena();
    world.manaEconomy = { ...DEFAULT_MANA_ECONOMY, enabled: false };
    // 對照組。⚠️ 這一條同時是上面那條的反面：兩條都過才代表「是這個開關在動」，
    // 而不是英雄本來就回得夠快。
    expect(refillRatio(world, id, DEFAULT_MANA_ECONOMY.refillSeconds)).toBeLessThan(1);
  });
});

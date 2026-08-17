/**
 * 寶具（傳說武器）上架直接販售 —— owner 2026-08-17。
 *
 * 「寶具(傳說武器) 可以上架直接販售了，價格統一是**隨機抽的 6 倍**（後台可設定）」
 *
 * ⚠️ 這**推翻**了 2026-08-01 的「傳說的武器道具，只能隨機三選一」（task #82）。
 * 舊裁決沒有被靜靜刪掉：被改寫的那幾條守衛都在註解裡留著兩個日期與兩句話。
 *
 * 這一條守的是**機制**（第二守則），⛔ 不是數字：
 *   ① 出貨設定下，那張表裡的寶具**買得到**，而且收的錢是「寶玉價 × 出貨倍率」
 *      —— 兩者都從**常數與出貨 config 推導**，⛔ 檔案裡沒有 14400 也沒有 2400。
 *   ② 把那一格關掉，同一把回 `shelf-closed`，一塊錢都不收。
 *   ③ ⭐ **反向**：#261 下架的**普通**武器仍然買不到 —— 證明開的是寶具那一格，
 *      而不是把整個貨架打開（那 70 把 owner 沒有說要放回來）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { registerAll } from "../../content/registries";
import { Items, LootTables } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import { buyItem } from "./shop";
import { LEGENDARY_ORB_PRICE, LEGENDARY_POOL_TABLE, itemHasEffect } from "./itemTiers";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");

/** 出貨的那一份設定。⛔ 不重打一份 —— 讀 `content/config/arena-rules.json`。 */
const shippedShelf = (
  JSON.parse(readFileSync(join(CONTENT_DIR, "config/arena-rules.json"), "utf8")) as {
    // ⚠️ 2026-08-17 起這一區塊有四格（賣出退款率與隨機限定表是同一則裡的
    // 同一條金流決定）。`world.legendaryShelf` 是**整塊**指派的，所以這裡的
    // 形狀少一格就會 tsc 紅 —— 這正是我們要的：config 長出新欄位時，
    // 「world 預設 === 出貨 config」那一條不會靜靜地只比對舊的兩格。
    legendaryShelf?: {
      open: boolean;
      priceMultiplier: number;
      sellRefundPct: number;
      randomOnlyTables: string[];
    };
  }
).legendaryShelf;

/** 出貨的統一價，推導而來。 */
let expectedPrice = 0;
/** 從**表**裡挑一把（⛔ 不寫死 id：owner 隨時會換那 49 把）。 */
let treasure: ItemId;
/** 一把 #261 下架的普通武器 —— 不在那張表裡。 */
let normalWeapon: ItemId;

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  expect(shippedShelf, "content/config/arena-rules.json 少了 legendaryShelf 這一區塊").toBeDefined();
  expectedPrice = LEGENDARY_ORB_PRICE * shippedShelf!.priceMultiplier;

  const pool = LootTables.get(LEGENDARY_POOL_TABLE).entries.map((e) => e.itemId as ItemId);
  treasure = pool.find((id) => itemHasEffect(Items.get(id)))!;
  const inPool = new Set<string>(pool);
  normalWeapon = Items.all().find(
    (d) => d.craftRole === "final" && d.cost > 0 && itemHasEffect(d) && !inPool.has(d.id),
  )!.id;
  expect(treasure, "legendary-weapons 表裡沒有任何有效果的寶具").toBeDefined();
  expect(normalWeapon, "找不到一把 #261 下架的普通武器可以拿來做反向對照").toBeDefined();
});

function makeWorld(gold: number): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = spawnChampion(world, {
    championId: "godie-h020" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x + 2, z: c.z },
    zone: 0,
  });
  world.champion.get(id)!.gold = gold;
  return { world, id };
}

describe("寶具上架直接販售（owner 2026-08-17）", () => {
  it("SimWorld 的預設值 === 出貨 config —— 沒有 host 接線也不會兩邊各說各話", () => {
    expect(new SimWorld(SKELETON_ARENA, 1).legendaryShelf).toEqual(shippedShelf);
  });

  it("① 出貨設定下買得到，收的是「傳說寶玉 × 出貨倍率」", () => {
    const { world, id } = makeWorld(expectedPrice * 2);
    world.legendaryShelf = { ...shippedShelf! };
    const champ = world.champion.get(id)!;

    expect(buyItem(world, id, treasure)).toBe("ok");
    expect(champ.gold, "扣的金額不是推導價").toBe(expectedPrice);
    expect(champ.items).toContain(treasure);
    // undo 記的必須是**實付**金額；對不上就是一台印鈔機（買→undo 淨賺）。
    expect(champ.undoStack[champ.undoStack.length - 1]!.goldDelta).toBe(-expectedPrice);
  });

  it("② 關掉寶具那一格：同一把回 shelf-closed，一塊錢都不收", () => {
    const { world, id } = makeWorld(expectedPrice * 2);
    world.legendaryShelf = { ...shippedShelf!, open: false };
    const champ = world.champion.get(id)!;

    expect(buyItem(world, id, treasure)).toBe("shelf-closed");
    expect(champ.gold).toBe(expectedPrice * 2);
    expect(champ.items.every((s) => s === null)).toBe(true);
  });

  it("③ ⭐ 反向：#261 下架的普通武器仍然買不到", () => {
    const { world, id } = makeWorld(expectedPrice * 4);
    world.legendaryShelf = { ...shippedShelf! }; // 寶具那一格是開的
    const champ = world.champion.get(id)!;
    expect(world.weaponShelfOpen, "普通武器貨架不可以被寶具那一格順手打開").toBe(false);

    expect(buyItem(world, id, normalWeapon)).toBe("shelf-closed");
    expect(champ.gold).toBe(expectedPrice * 4);
    expect(champ.items.every((s) => s === null)).toBe(true);
  });
});

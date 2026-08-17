/**
 * 賣價 = **取得價** × 退款率 · 隨機限定階層 —— owner 2026-08-17。
 *
 * 「賣價一定是取得價的 40%（後台可設定），可註記目前取得的寶具是否為隨機取得」
 * 「仍然可以有寶具是**隨機才能取得**的」（今天的兩階：[EX解放] / [EX∅ 根源]）
 *
 * 一條承重的線，三個機制（第二守則：驗**機制**，⛔ 不驗數字 ——
 * 檔案裡沒有 9600 / 0.4 / 2400，全部從出貨常數與出貨 config 推導）：
 *   ① 商店**買**一把寶具 → 賣掉拿回「實付 × 出貨退款率」
 *   ② ⭐ 三選一**免費發**的同一把 → 賣掉拿回 **0**（這一條是印鈔機的閘）
 *   ③ 標成 randomOnly 的那一把：不在架上（`shopCatalogue`），伺服器也拒賣
 *
 * ⭐ 突變（已驗）：把 `sellItem` 的取得價換回 `def.cost` → ① 紅（拿回 0）而
 * ② 仍綠 —— 證明壓住的是「取得價」這條線本身，不是「退款有沒有發生」。
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
import { buyItem, grantItemFree, sellItem, slotRefund } from "./shop";
import { legendaryShelfListable, legendaryShelfIds, randomOnlyIds } from "./shopShelf";
import { LEGENDARY_ORB_PRICE, LEGENDARY_POOL_TABLE, itemHasEffect } from "./itemTiers";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");

/** 出貨的那一份設定。⛔ 不重打 —— 讀 `content/config/arena-rules.json`。 */
const shipped = (
  JSON.parse(readFileSync(join(CONTENT_DIR, "config/arena-rules.json"), "utf8")) as {
    legendaryShelf?: {
      open: boolean;
      priceMultiplier: number;
      sellRefundPct: number;
      randomOnlyTables: string[];
    };
  }
).legendaryShelf;

let price = 0;
let treasure: ItemId;

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  expect(shipped, "arena-rules.json 少了 legendaryShelf").toBeDefined();
  price = Math.round(LEGENDARY_ORB_PRICE * shipped!.priceMultiplier);
  treasure = LootTables.get(LEGENDARY_POOL_TABLE)
    .entries.map((e) => e.itemId as ItemId)
    .find((id) => itemHasEffect(Items.get(id)))!;
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
  world.legendaryShelf = { ...shipped! };
  world.champion.get(id)!.gold = gold;
  return { world, id };
}

describe("取得價 → 賣價（owner 2026-08-17）", () => {
  it("SimWorld 預設 === 出貨 config —— 沒有 host 接線也不會兩邊各說各話", () => {
    expect(new SimWorld(SKELETON_ARENA, 1).legendaryShelf).toEqual(shipped);
  });

  it("① 商店買來的寶具：賣掉拿回「實付 × 出貨退款率」", () => {
    const { world, id } = makeWorld(price);
    const champ = world.champion.get(id)!;
    expect(buyItem(world, id, treasure)).toBe("ok");
    expect(champ.gold).toBe(0);

    const expected = Math.floor(price * shipped!.sellRefundPct);
    expect(expected, "出貨退款率算出 0 元，這條守衛就什麼都沒壓住").toBeGreaterThan(0);
    const slot = champ.items.indexOf(treasure);
    expect(slotRefund(world, champ, slot), "面板與實付必須是同一個函式").toBe(expected);
    expect(sellItem(world, id, slot)).toBe(true);
    expect(champ.gold, "賣價沒有乘在實付金額上").toBe(expected);
  });

  it("② ⭐ 三選一免費發的同一把：賣掉拿回 0（印鈔機的閘）", () => {
    const { world, id } = makeWorld(0);
    const champ = world.champion.get(id)!;
    const slot = grantItemFree(world, id, treasure);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(champ.itemAcq![slot]!.random, "免費發的要被註記成隨機取得").toBe(true);

    expect(sellItem(world, id, slot)).toBe(true);
    expect(champ.gold, "免費拿到的寶具賣掉竟然有錢 —— 一場可以印三筆").toBe(0);
  });

  it("③ randomOnly 的那一把：不上架，而且伺服器拒賣", () => {
    const { world, id } = makeWorld(price * 2);
    // 把寶具那張表整張標成隨機限定 —— 機制驗證用的是**同一個開關**，
    // ⛔ 不是為測試開的後門（出貨值是空陣列，49 把照常上架）。
    world.legendaryShelf = { ...shipped!, randomOnlyTables: [LEGENDARY_POOL_TABLE] };
    const ids = randomOnlyIds(world.legendaryShelf.randomOnlyTables);
    expect(ids.has(treasure)).toBe(true);

    // 畫面那一邊（`shopCatalogue` 讀同一支）
    expect(legendaryShelfListable(treasure, true, legendaryShelfIds(), ids)).toBe(false);
    // 伺服器那一邊 —— 只擋一邊 = 買得到卻被拒
    expect(buyItem(world, id, treasure)).toBe("shelf-closed");
    expect(world.champion.get(id)!.gold).toBe(price * 2);
  });
});

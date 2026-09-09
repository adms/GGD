import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { registerAll } from "../../content/registries";
import { Items } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import { grantItemFree } from "./shop";
import { applyItemPick, type ItemOffer } from "./draft";

/**
 * ⭐⭐ GH#1110 B ——「背包滿的時候可以賣掉一件換上新的」。
 *
 * ⚠️ ⭐ 出貨 `legendaryShelf.swapWhenFull = false` 是**刻意**的：
 *   它改變一場比賽的取捨（「先想清楚再拿」vs「隨時可換」）——
 *   ⛔ 那是 owner 的設計決定，⛔ 不是我能引用得到原話的東西（第一守則）。
 *
 * ⇒ 兩條路都驗：⭐ **關著（出貨值）是承重的那一條**（第〇·六守則：測預設那一邊），
 *   ⛔ 而打開那一條在這裡的用途是**證明①不是「永遠不換」**。
 */

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const shipped = (
  JSON.parse(readFileSync(join(CONTENT_DIR, "config/arena-rules.json"), "utf8")) as {
    legendaryShelf?: { swapWhenFull: boolean; sellRefundPct: number; open: boolean;
                       priceMultiplier: number; randomOnlyTables: string[] };
  }
).legendaryShelf;

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

function makeWorld(): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = spawnChampion(world, {
    championId: "godie-h020" as ChampionId,
    seatId: asSeatId(0), teamId: asTeamId(0),
    pos: { x: c.x + 2, z: c.z }, zone: 0,
  });
  world.legendaryShelf = { ...shipped! };
  return { world, id };
}

/** ⭐ 塞到再也放不進去為止，並回傳塞了幾件（⛔ 不假設欄位數）。 */
function fill(world: SimWorld, id: EntityId): { n: number; used: ItemId[] } {
  const used: ItemId[] = [];
  for (const item of Items.ids() as ItemId[]) {
    if (grantItemFree(world, id, item) < 0) break;
    used.push(item);
  }
  return { n: used.length, used };
}

function offerOf(id: EntityId, pick: ItemId): ItemOffer {
  return { entity: id, choices: [pick], picked: null } as unknown as ItemOffer;
}

describe("背包滿時的三選一（GH#1110 B）", () => {
  it("⭐ 量尺先自證：真的塞滿了，⛔ 而且再放一件會失敗", () => {
    const { world, id } = makeWorld();
    const { n } = fill(world, id);
    expect(n, "⛔ 一件都放不進 ⇒ 尺是瞎的").toBeGreaterThan(0);
    const spare = Items.ids().find((i) => grantItemFree(world, id, i as ItemId) >= 0);
    expect(spare, "⛔ 還放得進去 ⇒ 背包沒滿").toBeUndefined();
  });

  it("① 開關**關著**（出貨值）⇒ ⛔ 不換，⭐ 而卡片留著（承重）", () => {
    const { world, id } = makeWorld();
    fill(world, id);
    expect(world.legendaryShelf.swapWhenFull, "⛔ 出貨值變了 —— 這條測的就是預設那一邊").toBe(false);
    const pick = Items.ids().at(-1) as ItemId;
    const offer = offerOf(id, pick);
    expect(applyItemPick(world, offer, pick, 0)).toBe("no-slot");
    expect(offer.picked, "⛔ 機會被吃掉了").toBeNull();
  });

  it("② 開關**打開** ⇒ ⭐ 賣掉指定那一格並換上（⛔ 證明①不是「永遠不換」）", () => {
    const { world, id } = makeWorld();
    const { used } = fill(world, id);
    world.legendaryShelf = { ...world.legendaryShelf, swapWhenFull: true };
    // ⛔⛔ 這一行曾經是 `[...Items.all().keys()]` ⇒ ⭐ `all()` 回的是**陣列**,
    //   `.keys()` 給的是**索引**（0,1,2…）⇒ `pick` 變成 `0` ⇒ `grantItemFree` 認不得它
    //   ⇒ 賣掉了卻換不上 ⇒ ⭐ **測試自己是那個錯,⛔ 程式是對的**。
    //   ⚠️ 正確的迭代是 `Items.ids()`（本檔上面兩處已經是）。
    const usedSet = new Set<unknown>(used);
    const pick = (Items.ids() as ItemId[]).find((i) => !usedSet.has(i))!;
    const offer = offerOf(id, pick);
    expect(applyItemPick(world, offer, pick, 0)).toBe("ok");
    expect(offer.picked, "⛔ 換成功了而卡片沒記錄").toBe(pick);
  });

  it("③ 打開但**沒指定要賣哪一格** ⇒ ⛔ 仍然不換（⭐ 不可以自己挑一件丟掉）", () => {
    const { world, id } = makeWorld();
    fill(world, id);
    world.legendaryShelf = { ...world.legendaryShelf, swapWhenFull: true };
    const pick = Items.ids().at(-1) as ItemId;
    const offer = offerOf(id, pick);
    expect(applyItemPick(world, offer, pick)).toBe("no-slot");
    expect(offer.picked).toBeNull();
  });
});

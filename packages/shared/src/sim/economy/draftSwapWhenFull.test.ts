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
import { shopAccess } from "./shopAccess";

/**
 * ⭐⭐ GH#1110 B ——「背包滿的時候可以賣掉一件換上新的」。
 *
 * ⭐ 出貨 `legendaryShelf.swapWhenFull = true`（owner 2026-09-08「A ＋ B 開票」，
 *   與客戶端換裝介面同一個 commit 翻開）。⚠️ 在此之前這裡釘著「出貨 false」——
 *   第〇·六守則：預設值改變 ⇒ 測**新的預設**，⛔ 關著那一條（rollback 路）不測。
 * ⇒ 端到端（真的 MatchController ＋ 玩家指令）在 `apps/game-server/src/match/offerSwap.test.ts`；
 *   這一份只驗 sim 那一支的三個分支。
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

  it("① 出貨預設（開著）＋指定格 ⇒ ⭐ 賣掉那一格並換上，⛔ 且那一筆賣出不留可復原紀錄", () => {
    const { world, id } = makeWorld();
    const { used } = fill(world, id);
    expect(world.legendaryShelf.swapWhenFull, "⛔ 出貨預設變了 —— 這條測的是預設開著那一邊，改測新的預設").toBe(true);
    // ⛔⛔ 這一行曾經是 `[...Items.all().keys()]` ⇒ ⭐ `all()` 回的是**陣列**,
    //   `.keys()` 給的是**索引**（0,1,2…）⇒ `pick` 變成 `0` ⇒ `grantItemFree` 認不得它
    //   ⇒ 賣掉了卻換不上 ⇒ ⭐ **測試自己是那個錯,⛔ 程式是對的**。
    //   ⚠️ 正確的迭代是 `Items.ids()`（本檔上面兩處已經是）。
    const usedSet = new Set<unknown>(used);
    const pick = (Items.ids() as ItemId[]).find((i) => !usedSet.has(i))!;
    const offer = offerOf(id, pick);
    expect(applyItemPick(world, offer, pick, 0)).toBe("ok");
    expect(offer.picked, "⛔ 換成功了而卡片沒記錄").toBe(pick);
    // ⚠️ 那一格已被新道具佔掉 ⇒ 留著「賣出」的復原紀錄只會永遠 stale、擋住底下每一筆。
    expect(world.champion.get(id)!.undoStack.some((t) => t.kind === "sell"), "⛔ 換裝留下了一筆必 stale 的復原").toBe(false);
  });

  it("② 開著但**沒指定要賣哪一格** ⇒ ⛔ 仍然不換（⭐ 不可以自己挑一件丟掉）", () => {
    const { world, id } = makeWorld();
    fill(world, id);
    const pick = Items.ids().at(-1) as ItemId;
    const offer = offerOf(id, pick);
    expect(applyItemPick(world, offer, pick)).toBe("no-slot");
    expect(offer.picked).toBeNull();
  });

  it("③ 換裝是一次**賣出** ⇒ ⭐ 守商店同一條規則：戰鬥中活著 ⇒ 回拒絕原因、⛔ 一件都沒賣", () => {
    const { world, id } = makeWorld();
    const { used } = fill(world, id);
    world.economyOpen = false;
    world.combatActive = true;
    const pick = Items.ids().at(-1) as ItemId;
    const offer = offerOf(id, pick);
    expect(applyItemPick(world, offer, pick, 0)).toBe("no-slot");
    expect(world.champion.get(id)!.items[0], "⛔ 繞過 shopAccess 把道具賣掉了").toBe(used[0]);
    const rej = world.events.filter((e) => e.type === "itemPickRejected").at(-1);
    const access = shopAccess(world, id);
    expect(access.open, "⛔ 前提不成立：這個夾具下商店是開的").toBe(false);
    expect(rej?.data.reason, "⛔ 拒絕原因不是商店規則那一條").toBe(access.open ? "" : access.reason);
  });
});

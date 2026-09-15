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
import { buyItem, grantItemFree, undoShopAction } from "./shop";
import { applyItemPick, type ItemOffer } from "./draft";
import { shopAccess } from "./shopAccess";
import { legendaryShelfIds } from "./shopShelf";

/**
 * ⭐⭐ GH#1110 B ——「背包滿的時候可以賣掉一件換上新的」。
 *
 * ⭐ 出貨 `legendaryShelf.swapWhenFull = true`（Claude 依 owner 2026-09-08「A ＋ B 開票」翻開，
 *   與客戶端換裝介面同一個 commit）。⚠️ 在此之前這裡釘著「出貨 false」——
 *   第〇·六守則：預設值改變 ⇒ 測**新的預設**，⛔ 關著那一條（rollback 路）不測。
 * ⇒ 端到端（真的 MatchController ＋ 玩家指令）在 `apps/game-server/src/match/offerSwap.test.ts`；
 *   這一份只驗 sim 那一支的三個分支。
 *
 * ── 突變紀錄（實跑，2026-09-15 修正輪）──────────────────────────────────
 * M1 `draft.ts` 換裝那一段的 `commitShopSession(...)` 改回前一版的 `undoStack.pop()` → ① 紅（undo 退回實付）。
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

/** 背包塞到剩一格，再從**出貨寶具架**付錢買一把進最後一格（⛔ 不寫死 id 與價錢：挑第一把買得到的）。 */
function buyIntoLastSlot(world: SimWorld, id: EntityId): { x: ItemId; slot: number; g0: number } {
  const champ = world.champion.get(id)!;
  const shelf = legendaryShelfIds();
  for (const item of Items.ids() as ItemId[]) {
    if (champ.items.filter((s) => s === null).length <= 1) break;
    if (!shelf.has(item)) grantItemFree(world, id, item);
  }
  champ.gold = 1_000_000;
  const g0 = champ.gold;
  const x = ([...shelf].sort() as ItemId[]).find((i) => buyItem(world, id, i) === "ok");
  expect(x, "⛔ 出貨寶具架一把都買不進最後一格 ⇒ 前提不成立").toBeDefined();
  return { x: x!, slot: champ.items.indexOf(x!), g0 };
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

  it("① 出貨預設（開著）＋指定格 ⇒ ⭐ 賣掉那一格並換上；⛔ 換裝之後 undo 退不回任何錢（兩個方向）", () => {
    // 對照（尺先自證）：沒換裝時 undo 照常退回實付 —— 量不到這一邊，下面那個 0 什麼都不證明。
    const ctrl = makeWorld();
    const bought = buyIntoLastSlot(ctrl.world, ctrl.id);
    expect(undoShopAction(ctrl.world, ctrl.id)).toBe("ok");
    expect(ctrl.world.champion.get(ctrl.id)!.gold, "⛔ 對照組 undo 沒退回實付 ⇒ 尺是瞎的").toBe(bought.g0);

    // 審查重現（2026-09-15）：買 X → 用免費卡上的 X 換掉 X 那一格 → undo，曾經淨賺 0.4×實付。
    const { world, id } = makeWorld();
    expect(world.legendaryShelf.swapWhenFull, "⛔ 出貨預設變了 —— 這條測的是預設開著那一邊，改測新的預設").toBe(true);
    const { x, slot } = buyIntoLastSlot(world, id);
    const offer = offerOf(id, x);
    expect(applyItemPick(world, offer, x, slot)).toBe("ok");
    expect(offer.picked, "⛔ 換成功了而卡片沒記錄").toBe(x);
    const champ = world.champion.get(id)!;
    const afterSwap = champ.gold;
    undoShopAction(world, id);
    expect(champ.gold - afterSwap, "⛔ 換裝之後 undo 退回了錢 —— 免費三選一換成了一筆錢").toBe(0);
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

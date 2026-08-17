/**
 * ⭐ 後台的**寶具貨架**真的走進了比賽，而且**逐格退款**真的到得了客戶端。
 *
 * 為什麼要有這一份 —— 2026-08-17 那一批做完了 Zod、出貨 JSON、後台頁與 sim 的
 * 讀取端，而 `grep legendaryShelf apps/game-server` 是**空的**：後台那四格
 * （上架 / 統一價倍率 / 賣出退款率 / 隨機限定表）一格都到不了比賽，場上收的
 * 永遠是 `sim/economy/shopShelf.ts` 的常數。與 `augmentEnemyFilter`、`combatFeel`
 * 同一種手滑（失敗形態 ②：算出來了但從沒送到玩家面前）。
 *
 * ⛔ 兩條都**不驗名詞** —— 「`rules.legendaryShelf` 有值」對壞掉的接線也是綠的。
 * 驗的是**配對關係**（同 CLAUDE.md 的「配對式後置條件」）：
 *   ① 一份把 `priceMultiplier` 換成測試自己捏的值的 config → 真的 MatchController
 *      → 商店那一把**收的錢**跟著變。這條線同時穿過 `rulesFromDoc` 與建構子的
 *      指派，任何一段斷掉都會退回出貨倍率而紅。
 *   ② 伺服器算出來的退款金額真的躺在 `SeatState` 上（買一把 → 投影 → 讀回
 *      `slotRefund` 的同一個數字）。在這之前客戶端算不出來（實付只有伺服器有），
 *      裝備格一律顯示「?」。
 *
 * ⛔ 零出貨數值：倍率是測試捏的，金額一律從 `legendaryShelfPrice` / `slotRefund`
 * 推導 —— 抄 9,600 或 3,840 就是第四個住處，而它沒有守衛（第二守則）。
 *
 * ── 突變紀錄（實跑）───────────────────────────────────────────────────────
 * M1 `MatchController` 的 `this.world.legendaryShelf = …` 整行刪掉 → ① FAIL
 *    （收的是出貨倍率算出來的價，不是測試捏的那一個）。② 仍綠。
 * M2 `net/snapshot.ts` 的 `setArray(ss.itemRefund, …)` 刪掉 → ② FAIL（undefined）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader, registerAll, zConfigArenaRulesDoc, type ConfigArenaRulesDoc } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Items, LootTables } from "@ggd/shared/sim/content/registry";
import { buyItem, slotRefund } from "@ggd/shared/sim/economy/shop";
import { LEGENDARY_POOL_TABLE, itemHasEffect, legendaryShelfPrice } from "@ggd/shared/sim/economy/itemTiers";
import { MatchState } from "@ggd/shared/protocol/schema";
import type { EntityId, ItemId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";
import { rulesFromDoc } from "./arenaRules";
import { projectSnapshot } from "../net/snapshot";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** 測試自己捏的倍率。⛔ 不可以等於出貨值，否則接線斷了也看不出來。 */
const CAPRICE = 2.5;

let doc: ConfigArenaRulesDoc;
let treasure: ItemId;

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  doc = zConfigArenaRulesDoc.parse(JSON.parse(readFileSync(join(CONTENT_DIR, "config/arena-rules.json"), "utf8")));
  // 從**表**裡挑一把（⛔ 不寫死 id：owner 隨時會換那 49 把）。
  treasure = LootTables.get(LEGENDARY_POOL_TABLE)
    .entries.map((e) => e.itemId as ItemId)
    .find((id) => itemHasEffect(Items.get(id)))!;
  expect(doc.legendaryShelf?.priceMultiplier, "出貨倍率剛好等於測試捏的值，這條就證明不了東西").not.toBe(CAPRICE);
});

/** 一場真的比賽，停在中場（商店開著的那一格）。 */
function shopping(mult: number): { ctl: MatchController; entity: EntityId } {
  const rules = rulesFromDoc({ ...doc, legendaryShelf: { ...doc.legendaryShelf!, priceMultiplier: mult } });
  const ctl = new MatchController("legendary-shelf-wiring", 42, allBots(), FAST, 3, rules);
  let n = 0;
  while (ctl.phase.phase !== "intermission" && n++ < 500) ctl.tick();
  expect(ctl.phase.phase).toBe("intermission");
  return { ctl, entity: [...ctl.seats.values()].find((s) => s.entityId !== null)!.entityId! };
}

describe("寶具貨架的後台設定真的進得了比賽（legendary-shelf-wiring）", () => {
  it("① 後台改倍率 → 這一場**收的錢**就是那個倍率算出來的（config → rules → world → 扣款）", () => {
    const { ctl, entity } = shopping(CAPRICE);
    const price = legendaryShelfPrice(CAPRICE);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = price * 2;

    expect(buyItem(ctl.world, entity, treasure)).toBe("ok");
    expect(champ.gold, "扣的不是後台那個倍率算出來的價 —— 接線斷了，讀到的是出貨常數").toBe(price);
  });

  it("② 伺服器算的逐格退款真的躺在 SeatState 上（客戶端在此之前只能顯示「?」）", () => {
    const { ctl, entity } = shopping(CAPRICE);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = legendaryShelfPrice(CAPRICE) * 2;
    expect(buyItem(ctl.world, entity, treasure)).toBe("ok");

    const slot = champ.items.indexOf(treasure);
    const expected = slotRefund(ctl.world, champ, slot);
    expect(expected, "退款是 0 的話這條就退化成 0 === 0，證明不了投影有跑").toBeGreaterThan(0);

    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    const ss = [...state.seats.values()].find((s) => s.entityId === entity)!;
    expect([...ss.itemRefund][slot], "面板讀到的退款與伺服器要付的不是同一個數字").toBe(expected);
    expect([...ss.itemRandom][slot], "用金幣買的那一把不可以被標成隨機取得").toBe(false);
  });
});

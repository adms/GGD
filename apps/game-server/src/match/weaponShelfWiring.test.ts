/**
 * ⭐ GH#350 —— 後台的**普通武器貨架**真的走進了比賽。
 *
 * 為什麼要有這一份：#261 下架的那 70 把武器從 2026-07-28 起就是
 * `sim/economy/shopShelf.ts` 的一個 export 布林常數，而 `grep world.weaponShelfOpen`
 * 在 production 程式**是空的** —— 只有測試在寫它。改一次要重建映像 + 重啟容器
 * （違反第一守則），而 `shopShelf.test.ts` 那條「翻成 true 就恢復購買」是綠的，
 * 因為它自己就是那個唯一的寫入端（失敗形態 ⑤：被測的不是出貨的那個）。
 *
 * ⛔ 這一條**不驗名詞**（「`rules.weaponShelfOpen` 有值」對壞掉的接線也是綠的），
 * 驗的是**配對關係**：同一件武器、同一位英雄，只有 config 那一格不同 →
 * 一邊收得到錢、一邊被拒。這條線同時穿過 `rulesFromDoc` 與 `MatchController`
 * 的指派，任何一段斷掉都會退回程式常數（false）而紅。
 *
 * ⛔ 零出貨數值：買哪一把是從登錄表**挑**出來的（owner 隨時在換那 70 把），
 * 金額一律讀 `def.cost`。
 *
 * ── 突變紀錄（實跑）───────────────────────────────────────────────────────
 * M1 `MatchController` 的 `this.world.weaponShelfOpen = …` 整行刪掉
 *    → ①「後台打開 → 買得到」FAIL（回 shelf-closed：world 讀的是程式常數）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader, registerAll, zConfigArenaRulesDoc, type ConfigArenaRulesDoc } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Items } from "@ggd/shared/sim/content/registry";
import { buyItem } from "@ggd/shared/sim/economy/shop";
import { legendaryShelfIds } from "@ggd/shared/sim/economy/shopShelf";
import { isShopService } from "@ggd/shared/sim/economy/itemTiers";
import type { EntityId, ItemId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";
import { rulesFromDoc } from "./arenaRules";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

let doc: ConfigArenaRulesDoc;

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  doc = zConfigArenaRulesDoc.parse(JSON.parse(readFileSync(join(CONTENT_DIR, "config/arena-rules.json"), "utf8")));
  // 出貨值必須是「關著」，否則下面的 open=true 那一半對壞掉的接線也會過。
  expect(doc.weaponShelfOpen, "出貨就開著的話這一條證明不了東西").not.toBe(true);
});

/** 一場真的比賽，停在中場（商店開著的那一格），貨架依 config 那一格決定。 */
function shopping(open: boolean): { ctl: MatchController; entity: EntityId } {
  const rules = rulesFromDoc({ ...doc, weaponShelfOpen: open });
  // bot 半價（owner 2026-08-18）與這一條無關，關掉以免價格判斷混進折扣。
  const ctl = new MatchController("weapon-shelf-wiring", 42, allBots(), FAST, 3, {
    ...rules,
    botShop: { buyWeapons: false, priceMult: 1 },
  });
  let n = 0;
  while (ctl.phase.phase !== "intermission" && n++ < 500) ctl.tick();
  expect(ctl.phase.phase).toBe("intermission");
  return { ctl, entity: [...ctl.seats.values()].find((s) => s.entityId !== null)!.entityId! };
}

describe("普通武器貨架的後台設定真的進得了比賽（weapon-shelf-wiring, GH#350）", () => {
  it("同一把武器：後台打開就收得到錢，關著就被拒 —— 只有 config 那一格不同", () => {
    // ① 打開的那一場：從登錄表逐一試，找到第一把真的成交的普通武器。
    const opened = shopping(true);
    const openChamp = opened.ctl.world.champion.get(opened.entity)!;
    let bought: ItemId | null = null;
    // ⚠️ 候選必須是一把**真的普通武器**：兩項商店服務（能力屬性強化／傳說寶玉）
    // 在 `buyItem` 裡是**按 id 提前分派**的，寶具走的是 `legendaryShelf.open`
    // 那一格 —— 挑到它們的話這一條會對著另一個開關全綠（失敗形態 ④）。
    const legendary = legendaryShelfIds();
    for (const id of [...Items.ids()].sort() as ItemId[]) {
      const def = Items.get(id);
      if (def.cost <= 0 || isShopService(id) || legendary.has(id)) continue;
      openChamp.gold = def.cost * 4;
      if (buyItem(opened.ctl.world, opened.entity, id) === "ok") {
        bought = id;
        break;
      }
    }
    expect(bought, "貨架打開之後一把都買不到 —— config → rules → world 這條線斷了").not.toBeNull();
    expect(openChamp.gold, "收的錢對不上標價").toBe(Items.get(bought!).cost * 3);

    // ② 關著的那一場：**同一把**、同樣有錢，必須被拒而且一塊錢都不動。
    const closed = shopping(false);
    const closedChamp = closed.ctl.world.champion.get(closed.entity)!;
    closedChamp.gold = Items.get(bought!).cost * 4;
    expect(buyItem(closed.ctl.world, closed.entity, bought!)).toBe("shelf-closed");
    expect(closedChamp.gold, "關著的貨架收了錢").toBe(Items.get(bought!).cost * 4);
  });
});

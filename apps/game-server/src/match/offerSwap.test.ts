/**
 * 🎒 GH#1110 B 的**承重守衛**：背包滿的免費三選一，玩家指定一格 ⇒ 賣掉它、換上新的。
 *
 * > 「隨機選寶具的時候 道具欄已滿 怎麼辦」
 * > 「A ＋ B 開票」
 * —— owner 2026-09-08 02:28（前一句：`docs/_daily/ledger-source_temp_20260908.md:13`；後一句：裁決紀錄
 *    `docs/_daily/2026-09-08.md:13` 與 GH#1110 body 第 3 行）。⚠️ 裁決紀錄裡跟在後面的括號
 *    「A＝…；B＝讓玩家挑一件丟掉/賣掉再換上。⛔ 不做 C「事前不發卡」」是 Claude 補的註解，⛔ 不是原話。
 *
 * ⭐ 走**出貨的整條路**，⛔ 不直接呼叫 `applyPick`（上一輪 sim 那一半做完了，
 * ⛔ 而 `MatchController` 呼叫它時沒傳 `swapSlot`、`validateInput` 也只收 `offerId`
 * ⇒ 開關開著玩家也換不了 —— 直接呼叫私有方法的測試對那個缺陷是綠的）：
 *   出貨 `arena-rules.json` → `rulesFromDoc` → 真的 MatchController
 *   → 客戶端送的原始物件過 `sanitizeCommand` → HumanDriver → CommandSystem → drain → sim。
 *
 * 兩個方向：① 帶 `swapSlot` ⇒ 換上、退款照 `slotRefund`；② 不帶 ⇒ 卡留著、⛔ 不記帳。
 * ③ 同批缺陷：AI 座位滿背包的卡 ⇒ ⛔ 不逐 tick 重試（一筆帳、卡消耗）。
 *
 * ── 突變紀錄（實跑）──────────────────────────────────────────────────────
 * M1 `MatchController` drain 裡 `this.applyPick(…, false, swapSlot)` 拿掉 `swapSlot` → ① 紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader, registerAll, zConfigArenaRulesDoc } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Items } from "@ggd/shared/sim/content/registry";
import { grantItemFree, slotRefund } from "@ggd/shared/sim/economy/shop";
import { offerItems } from "@ggd/shared/sim/economy/draft";
import { asSeatId, type EntityId, type ItemId } from "@ggd/shared/ids";
import { AI_OFFER_PICK_DELAY_TICKS, MatchController, type SeatSpec } from "./MatchController";
import { rulesFromDoc, type ArenaRules } from "./arenaRules";
import { HumanDriver } from "../seat/HumanDriver";
import { sanitizeCommand } from "../net/validateInput";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const FAST = { champSelectTicks: 5, intermissionTicks: 60, combatMaxTicks: 1200, resolutionTicks: 5 };
const bots = (): SeatSpec[] => Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));
let rules: ArenaRules;

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  rules = rulesFromDoc(zConfigArenaRulesDoc.parse(JSON.parse(readFileSync(join(CONTENT_DIR, "config/arena-rules.json"), "utf8"))));
  expect(rules.legendaryShelf.swapWhenFull, "⛔ 出貨預設變了 —— 這一份測的是預設開著那一邊").toBe(true);
});

/** 一場進到中場的比賽；`seat` 的背包塞滿（每格記一筆**實付**，退款才是真的數字）並開一張免費卡。 */
function fullBagWithCard(seatNo: number, human: boolean) {
  const ctl = new MatchController(`swap-${seatNo}`, 17, bots(), FAST, 3, rules);
  for (let n = 0; ctl.phase.phase !== "intermission" && n < 500; n++) ctl.tick();
  const seat = ctl.seats.get(asSeatId(seatNo))!;
  const driver = new HumanDriver();
  if (human) seat.setDriver(driver);
  ctl.tick();
  const entity = seat.entityId as EntityId;
  const champ = ctl.world.champion.get(entity)!;
  for (const id of Items.ids() as ItemId[]) {
    if (!champ.items.includes(null)) break;
    grantItemFree(ctl.world, entity, id, { paid: 1000, random: false });
  }
  const offer = offerItems(ctl.world, entity, "round-reward");
  expect(offer.choices.length, "卡片開不出來，前提不成立").toBeGreaterThan(0);
  const offerId = `test:1110b:${seatNo}`;
  // AI 座位：把卡片的年齡推過代選延遲（⭐ 從出貨常數推導，⛔ 不抄字面值）。
  const age = human ? 0 : AI_OFFER_PICK_DELAY_TICKS + 1;
  ctl.offers.set(offerId, { kind: "item", ...offer, seatId: seat.seatId, createdTick: ctl.world.tick - age });
  const itemOffers = () => ctl.ledger.snapshot().offers.filter((o) => o.seatId === seat.seatId && o.kind === "item");
  const press = (raw: Record<string, unknown>) => {
    driver.mailbox.push({ seq: 1, commands: [sanitizeCommand({ kind: "pickOffer", offerId: `${offerId}#0`, ...raw })!] });
    ctl.tick();
  };
  return { ctl, champ, offerId, pick: offer.choices[0]!, press, itemOffers };
}

describe("背包滿的免費三選一：換裝（GH#1110 B）", () => {
  it("① 帶 swapSlot ⇒ ⭐ 賣掉那一格、換上新的、退款＝那一格的 slotRefund，卡片消耗", () => {
    const { ctl, champ, offerId, pick, press } = fullBagWithCard(0, true);
    const slot = 2;
    const refund = slotRefund(ctl.world, champ, slot);
    const gold = champ.gold;
    press({ swapSlot: slot });
    expect(champ.items[slot], "⛔ 玩家指定了要換的格子，新道具沒有進去 —— 指令沒送到 sim").toBe(pick);
    expect(champ.gold - gold, "⛔ 退款不是那一格的實付 × 退款率").toBe(refund);
    expect(ctl.offers.has(offerId), "⛔ 換成功了卡片還在").toBe(false);
  });

  it("② 不帶 swapSlot ⇒ ⛔ 不換、卡片留著、⛔ 不記帳（卡片沒被消耗）", () => {
    const { ctl, champ, offerId, press, itemOffers } = fullBagWithCard(0, true);
    const before = [...champ.items];
    const records = itemOffers().length;
    press({});
    expect(ctl.world.events.some((e) => e.type === "itemPickRejected"), "⛔ 背包滿而沒有拒絕訊息").toBe(true);
    expect(champ.items, "⛔ 沒指定格子卻動了背包").toEqual(before);
    expect(ctl.offers.has(offerId), "⛔ 卡片被吃掉了").toBe(true);
    expect(itemOffers().length, "⛔ 卡片沒消耗卻記了一筆帳").toBe(records);
  });

  it("③ AI 座位滿背包的卡 ⇒ ⛔ 不逐 tick 重試：恰好一筆帳（picked=null）、卡片消耗", () => {
    const { ctl, offerId, itemOffers } = fullBagWithCard(1, false);
    for (let i = 0; i < 5; i++) ctl.tick();
    expect(ctl.offers.has(offerId), "⛔ AI 的卡一直開著 ⇒ 下一 tick 又重試一次").toBe(false);
    const mine = itemOffers().filter((o) => o.picked === null);
    expect(mine.length, "⛔ 同一張卡記了不只一筆（逐 tick 灌帳）").toBe(1);
  });
});

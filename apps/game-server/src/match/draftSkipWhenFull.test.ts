/**
 * 🎒 **背包滿時，三選一的「放棄」**（GH#1271）—— 出貨那條路，⛔ 不是夾具自己造的通道。
 *
 * ── 這條守衛守的是哪一段 ────────────────────────────────────────
 * 玩家回報的症狀是「卡片走不掉」：背包滿 ⇒ 卡片壓暗（GH#1110 A3）、商店被遮罩擋住（賣不了）、
 * 而中場**不能在有卡片開著時結束** ⇒ ⭐ Ready 也按不了。#1271 的出口是讓他**丟掉那張卡**。
 *
 * ⭐ 因此這一條跑的是**真的比賽**：真的跑到發武器卡的那個中場、真的用 `HumanDriver` 的信箱送
 * `pickOffer{skip:true}`（⛔ 不直接呼叫 `applyPick` —— 那會量到一個玩家走不到的通道，失敗形態⑤），
 * 然後問三件出貨才看得到的事：
 *   ① 卡片**真的被消耗**（`ctl.offers` 少一張）
 *   ② 背包**一格都沒動**（放棄 ⛔ 不是換裝、⛔ 不偷塞東西）
 *   ③ 帳本那一筆是 `picked=null, auto=false` —— ⭐ 與「時間到系統代選」（`auto=true`）分得開，
 *      否則「選取率」會把玩家的決定與逾時混成同一個樣本
 *
 * ⭐ 量尺自證（兩個方向）：開關**關著**時同一按鍵 ⇒ 卡片**留著**、背包不動 ——
 * 少了這一條，就算整段 skip 分支被刪掉，①②③ 也可能因為別的原因而「看起來對」。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader, registerAll, zConfigArenaRulesDoc, type ConfigArenaRulesDoc } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Items } from "@ggd/shared/sim/content/registry";
import { grantItemFree } from "@ggd/shared/sim/economy/shop";
import { ITEM_OFFER_TIER } from "@ggd/shared/sim/economy/draft";
import { asSeatId, type EntityId, type ItemId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";
import { rulesFromDoc, type ArenaRules } from "./arenaRules";
import { HumanDriver } from "../seat/HumanDriver";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const FAST = { champSelectTicks: 3, intermissionTicks: 9999, combatMaxTicks: 60, resolutionTicks: 3 };
const seats = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

let ARENA: ArenaRules;

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  const doc = zConfigArenaRulesDoc.parse(
    JSON.parse(readFileSync(join(CONTENT_DIR, "config/arena-rules.json"), "utf8")),
  ) as ConfigArenaRulesDoc;
  // ⚠️ `draftConflict: "both"` 是這場實驗的**前提**（同 `legendaryCardWidth.test.ts`）：
  //   出貨排程發寶具的那兩個回合同時排了聖杯願望，而 owner 2026-08-17 裁決讓聖杯贏
  //   ⇒ 出貨預設下一張道具卡都看不到，整份會變成空跑。
  ARENA = { ...rulesFromDoc(doc), draftConflict: "both" };
});

/** `arena-rules` 排武器卡的第一個回合 —— ⛔ 不寫死 2（改排程不可以靜默失準）。 */
function firstWeaponRound(): number {
  for (const [round, grant] of [...ARENA.rounds.entries()].sort((a, b) => a[0] - b[0])) {
    if (grant.weaponLootTable) return round;
  }
  throw new Error("arena-rules 沒有任何回合發武器卡 —— 這一支要重寫");
}

/** 跑到那個中場、把 0 號座位的背包塞滿、回傳按鍵用的把手。 */
function fullBagAtWeaponCard(skipWhenFull: boolean): {
  ctl: MatchController;
  entity: EntityId;
  offerId: string;
  bag: () => string[];
  press: (cmd: { kind: "pickOffer"; offerId: string; skip?: true }) => void;
} {
  const rules = { ...ARENA, legendaryShelf: { ...ARENA.legendaryShelf, skipWhenFull } };
  const ctl = new MatchController(`skip-full-${skipWhenFull}`, 31, seats(), FAST, 3, rules);
  const round = firstWeaponRound();
  let n = 0;
  while (!(ctl.phase.phase === "intermission" && ctl.phase.round === round) && n++ < 60000) ctl.tick();
  expect(ctl.phase.phase, "沒有跑到發武器卡的中場").toBe("intermission");
  const seat = ctl.seats.get(asSeatId(0))!;
  const driver = new HumanDriver();
  seat.setDriver(driver);
  ctl.tick(); // ⚠️ 換驅動之後要讓它先跑過一拍（同 attrOffer.test.ts）——⛔ 少了這一拍指令送不進去
  const entity = seat.entityId as EntityId;
  // 背包塞滿 —— 走出貨的 `grantItemFree`（⛔ 不手寫 champ.items：那是虛構通道）
  for (const id of Items.ids()) if (grantItemFree(ctl.world, entity, id as ItemId) < 0) break;
  const bag = (): string[] => [...(ctl.world.champion.get(entity)?.items ?? [])].map((s) => String(s ?? ""));
  expect(bag().filter((s) => s !== "").length, "⛔ 背包沒塞滿 ⇒ 這場實驗沒有鑑別力").toBe(bag().length);
  const card = [...ctl.offers.entries()].find(([, o]) => o.kind === "item" && o.seatId === asSeatId(0) && o.tier === ITEM_OFFER_TIER);
  expect(card, "⛔ 這個中場沒有道具卡 ⇒ 量錯回合").toBeTruthy();
  let seq = 0;
  return {
    ctl,
    entity,
    offerId: card![0],
    bag,
    press: (cmd) => {
      driver.mailbox.push({ seq: ++seq, commands: [cmd] });
      ctl.tick();
    },
  };
}

describe("🎒 背包滿時可以放棄那張獎勵卡（GH#1271）", () => {
  it("★★ 放棄 ⇒ 卡片消耗、背包一格都沒動、帳本記 picked=null / auto=false", () => {
    const s = fullBagAtWeaponCard(true);
    const before = s.bag();

    s.press({ kind: "pickOffer", offerId: s.offerId, skip: true });


    expect(s.ctl.offers.has(s.offerId), "⛔ 卡片還在 ⇒ 玩家仍然按不了 Ready（#1271 的原症狀）").toBe(false);
    expect(s.bag(), "⛔ 放棄動到了背包 —— 它不是換裝").toEqual(before);
    const rows = s.ctl.ledger.snapshot().offers.filter((o) => o.seatId === asSeatId(0));
    const last = rows[rows.length - 1];
    expect(last, "⛔ 帳本沒有這一筆 ⇒ 這張卡在統計上憑空消失").toBeTruthy();
    expect([last!.picked, last!.auto], "⛔ 放棄要記成「玩家決定不拿」，⛔ 不是逾時代選").toEqual([null, false]);
  });

  it("★ 量尺自證：開關關著 ⇒ 同一按鍵**不放棄**，卡片留著、背包不動", () => {
    const s = fullBagAtWeaponCard(false);
    const before = s.bag();

    s.press({ kind: "pickOffer", offerId: s.offerId, skip: true });

    expect(s.ctl.offers.has(s.offerId), "⛔ 開關關著卻照樣丟掉卡片 ⇒ 那格後台開關是裝飾").toBe(true);
    expect(s.bag()).toEqual(before);
  });
});

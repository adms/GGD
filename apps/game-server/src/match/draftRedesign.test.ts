/**
 * ⛔ **三選一重構（GH#357）+ bot 半價（owner 2026-08-18）的行為守衛。**
 *
 * ── 為什麼這一支必須存在 ───────────────────────────────────────────────────
 *
 * [EX∅ 根源] 在出貨設定下**「結構上不可能出現」已經發生過三次**，而三次的形狀
 * 完全不同、三次都通過了當時全部的測試：
 *
 *   ① 池不存在        → `weaponTierTables.test.ts`
 *   ② 回合窗口(10..10) 與發卡回合(2/5) 互斥 → `weaponTierWindows.test.ts`
 *   ③ **撞卡裁決把第 10 回合的寶具讓給了聖杯** → ⭐ **這一支**
 *
 * ③ 最難看見：`alternate` 的規則本身沒有錯，排程本身也沒有錯 —— 是「第 3 個排了
 * 寶具的回合」剛好落在讓給聖杯的那一邊。⛔ 分開檢查規則或排程都是綠的。
 * ⇒ 所以這裡驗的是**玩家真的收到了什麼**，⛔ 不是任何一個中間值。
 *
 * ── 突變紀錄 ───────────────────────────────────────────────────────────────
 * · `arenaRules.grailDraftAllowed`/`weaponDraftAllowed` 的 `draftBoth` 放行拿掉
 *   → 第一條紅（第 10 回合只收到一張）
 * · `MatchController` 的 `this.phase.ticksLeft += …` 拿掉 → 第二條紅
 * · `applyShopPriceMult` 改成永遠寫 1 → 第三條紅（bot 付了全額）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader, registerAll, zConfigArenaRulesDoc } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { TICK_HZ } from "@ggd/shared/constants";
import {
  LEGENDARY_ORB_ITEM_ID,
  LEGENDARY_ORB_PRICE,
  shopChargeFor,
} from "@ggd/shared/sim/economy/itemTiers";
import { buyItem } from "@ggd/shared/sim/economy/shop";
import { MatchController, type SeatSpec } from "./MatchController";
import { rulesFromDoc, type ArenaRules } from "./arenaRules";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

let ARENA: ArenaRules;
beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  ARENA = rulesFromDoc(
    zConfigArenaRulesDoc.parse(
      JSON.parse(readFileSync(join(CONTENT_DIR, "config/arena-rules.json"), "utf8")),
    ),
  );
});

/** 跑到某一回合的中場（發完卡的那一刻）。 */
function toIntermission(ctl: MatchController, round: number): void {
  for (let i = 0; i < 200000; i++) {
    if (ctl.phase.phase === "intermission" && ctl.phase.round === round) return;
    ctl.tick();
  }
  throw new Error(`never reached intermission ${round}`);
}

describe("三選一重構（GH#357）", () => {
  it("★ 最終回合**兩張都發**：每個座位同時收到聖杯與寶具（⇒ 根源真的抽得到）", () => {
    const ctl = new MatchController("both-r10", 777, allBots(), FAST, 3, ARENA);
    const round = ARENA.finalRound;
    expect(ARENA.rounds.get(round)?.draftBoth, "出貨沒把最終回合排成兩張都發").toBe(true);
    toIntermission(ctl, round);

    let seats = 0;
    for (const [key] of ctl.offers) {
      if (key.startsWith(`${round}:`) && !key.endsWith(":w")) seats++;
    }
    expect(seats, "最終回合一張聖杯都沒有").toBeGreaterThan(0);
    // ⚠️ 兩個方向一起讀：只驗寶具在的話，一個「兩張都不發」的實作也會過。
    let weapons = 0;
    for (const [key] of ctl.offers) if (key.startsWith(`${round}:`) && key.endsWith(":w")) weapons++;
    expect(
      weapons,
      "最終回合的寶具卡不見了 —— [EX∅ 根源] 的唯一窗口又關上了（第三次）",
    ).toBe(seats);
  });

  it("★ 兩張都發的回合，中場**真的**多了設定的秒數", () => {
    const round = ARENA.finalRound;
    const extra = Math.round(ARENA.bothDraftsExtraSec * TICK_HZ);
    expect(extra, "出貨沒有設延長秒數 —— 這條在空轉").toBeGreaterThan(0);

    const ctl = new MatchController("both-clock", 777, allBots(), FAST, 3, ARENA);
    toIntermission(ctl, round);
    const withBoth = ctl.phase.ticksLeft;

    // 對照組：同一場、同一顆種子，但把「兩張都發」關掉。
    const solo = { ...ARENA, rounds: new Map(ARENA.rounds) };
    solo.rounds.set(round, { ...ARENA.rounds.get(round)!, draftBoth: false, weaponDraftPct: 100 });
    const ctl2 = new MatchController("both-clock", 777, allBots(), FAST, 3, solo);
    toIntermission(ctl2, round);

    expect(withBoth - ctl2.phase.ticksLeft, "兩張都發卻沒有補時間").toBe(extra);
  });
});

describe("bot 的商店（owner 2026-08-18）", () => {
  it("★ bot 買隨機寶具（傳說寶玉），而且**真的只付半價**", () => {
    expect(ARENA.botShop.buyWeapons, "出貨關掉了 bot 買寶具").toBe(true);
    const ctl = new MatchController("bot-shop", 31, allBots(), FAST, 3, ARENA);
    toIntermission(ctl, 1);
    const seat = [...ctl.seats.values()][0]!;
    const champ = ctl.world.champion.get(seat.entityId!)!;
    // 折扣真的落在這個座位上（⛔ 不是只有設定檔裡有）。
    expect(champ.shopPriceMult, "bot 座位沒有拿到折扣倍率").toBe(ARENA.botShop.priceMult);

    champ.gold = LEGENDARY_ORB_PRICE; // 全額買得起一顆
    const before = champ.gold;
    // ⛔ 走**出貨的**那一支 `buyItem`（sim 的收費站），⛔ 不是在這裡自己扣錢 ——
    // 後者驗的是我抄的算式，不是引擎（失敗形態⑤）。
    const res = buyItem(ctl.world, seat.entityId!, LEGENDARY_ORB_ITEM_ID);
    expect(res, "寶玉沒買成 —— 這條在空轉").toBe("ok");
    const paid = before - ctl.world.champion.get(seat.entityId!)!.gold;
    expect(paid, "bot 付的不是半價").toBe(shopChargeFor(ARENA.botShop.priceMult, LEGENDARY_ORB_PRICE));
    expect(paid, "折扣倍率 1 的話這條是恆等式 —— 它必須真的比原價少").toBeLessThan(LEGENDARY_ORB_PRICE);
  });
});

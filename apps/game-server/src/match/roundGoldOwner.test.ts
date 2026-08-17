/**
 * owner 的金幣裁決,以及排程停在終局回合這件事。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 裁決
 * ═══════════════════════════════════════════════════════════════════════════
 *   ②「開局應該是 750」(owner 2026-08-01) → `rounds["1"].grantGold` 0(不存在)→ 750
 *
 * ⚠️ 這裡本來還有第二條:「第十回合後,每場都是 +4,000金幣」→ `rounds["11".."13"]`
 * 與 `overflow`。owner 2026-08-18 把那整段判成**舊資料**:
 *
 *   「我早就已經把**第十回合作為最終回合**全部玩家同一地圖大亂鬥,並且**打完就
 *     全部結算了**」「你是不是又查到舊資料了阿 **快整理到 legacy 去**」
 *
 * 那四筆設定已經搬進 `content/_legacy/config/arena-rules-rounds-11-13.json`
 * (⛔ 不是刪除 —— 哪天終局往後移就搬回來)。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 這個檔案現在守的方向
 * ═══════════════════════════════════════════════════════════════════════════
 * 它以前守的是「一段休眠的資料寫對了」,現在守的是「**沒有**休眠的資料」——
 * `PairedDuels.FINAL_ROUND` = 10 是唯一的結束條件(`maybeFinish` 看
 * `isRoyaleRound(round)`),所以任何超過第 10 回合的排程都是永遠讀不到的東西,
 * 而 owner 花了一整則訊息講的就是「別再讀到舊資料」。
 *
 * ⚠️ 兩組斷言仍然是「資料」+「行為」:資料斷言(①)只證明檔案裡寫了什麼,對「那筆
 * 錢有沒有真的進玩家錢包」一個字都沒說(失敗形態⑦)。所以 ② 走真的
 * `MatchController`、真的出貨 `arena-rules.json`,量玩家錢包,而且是**對照組
 * 減實驗組**(細節見 `pursesAtIntermission` 的檔頭)。③ 跑一場真的 12 人比賽到
 * 自然結束,記下實際打過的每一個回合。
 *
 * ⚠️ 順帶一提 `FINAL_ROUND` 仍然是一個**寫死的決策點**(CLAUDE.md 第一守則點名
 * 的那個形態,同 `CAPSTONE_ROUND_GATE = 6`)。`PairedDuels.ts` 的檔頭替它辯護過,
 * 但那段辯護講的是「不要做成第十三個建構子參數」,而不是「不要做成 arena-rules
 * 的一個欄位」。要不要開這個欄位是 owner 的決定,寫在這裡等他裁。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 突變紀錄
 * ═══════════════════════════════════════════════════════════════════════════
 *   G1. `arena-rules.json` 的 `rounds["1"].grantGold` 整格刪掉(= 動手前的狀態)
 *       ⇒ **3 紅**(① 的第 1 回合、② 的兩條行為)。2026-08-01 跑過。
 *   G4. 把 `rounds["11"]` 加回 arena-rules.json
 *       ⇒ **2 紅**(① 的「排程停在終局回合」、③ 末尾那條「排程也停在那裡」)。 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { STARTING_GOLD } from "@ggd/shared/sim/economy/progression";
import { MatchController, type SeatSpec } from "./MatchController";
import { resolveArenaRules, grantForRound, type ArenaRules } from "./arenaRules";
import { FINAL_ROUND } from "./PairedDuels";

/** The SHIPPED table, loaded from content/ — never a fixture (失敗形態 ⑤). */
let SHIPPED: ArenaRules;

beforeAll(async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const loaded = await new ContentLoader(new FsContentSource(join(here, "../../../../content"))).load();
  registerAll(loaded.store);
  SHIPPED = resolveArenaRules();
});

const FAST = { champSelectTicks: 4, intermissionTicks: 24, combatMaxTicks: 300, resolutionTicks: 3 };

const seats = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: true,
    championId: "godie-h01o", // 外掛開很大的死神 - 黑崎一護
  }));

// ───────────────────────────────────────────────────────────── ① 資料 ────

describe("① 出貨的 arena-rules 真的寫著 owner 的數字", () => {
  it("第 1 回合 = 750 金幣 (owner 2026-08-01「開局應該是 750」)", () => {
    cover("arena-config-parse");
    expect(SHIPPED.rounds.get(1)?.grantGold).toBe(750);
  });

  it("★ 排程停在終局回合 —— 第 11 回合起沒有比賽,所以也沒有 grant", () => {
    cover("arena-config-parse");
    // ⚠️ 這一條 2026-08-18 **反過來寫**了。它原本斷言「第 11/12/13 回合各 4,000 金幣」
    // 與「overflow 也是 4,000」,而 owner 那天講明了那整段是舊資料:
    //   「我早就已經把**第十回合作為最終回合**全部玩家同一地圖大亂鬥,並且**打完就
    //     全部結算了**」「你是不是又查到舊資料了阿 **快整理到 legacy 去**」
    // 那三列 + `overflow` 已經搬進 `content/_legacy/config/arena-rules-rounds-11-13.json`
    // （⛔ 不是刪除:知識不可以無聲消失,哪天終局往後移就把它們搬回來)。
    //
    // ⭐ 守的東西沒有變弱,是換了方向:以前守「休眠的資料寫對了」,現在守
    // 「**沒有**休眠的資料」—— 而後者才是 owner 真正在意的那件事(他花了一則訊息
    // 講的就是「別再讀到舊資料」)。
    expect(Math.max(...SHIPPED.rounds.keys()), "排程超過終局回合 = 又長出一段永遠讀不到的資料").toBe(
      FINAL_ROUND,
    );
    for (const r of [FINAL_ROUND + 1, 14, 99]) {
      expect(grantForRound(SHIPPED, r), `round ${r} 還發得出 grant —— 那是舊資料`).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────── ② 行為:錢包真的變多 ────

/**
 * 跑到第 `round` 回合 intermission **剛進入**的那一刻,回傳每個座位的錢包。
 *
 * ⚠️ 這裡讀的是**絕對值不是差額**,而那是被逼出來的,不是圖方便:第 1 回合的
 * intermission 就是離開 champSelect 的那一 tick,而英雄本體是在**同一 tick**
 * 才生出來的 —— 前一 tick 根本沒有錢包可以取樣(實測:差額量出來是 1,350,
 * 也就是「出生的 600 + 發放的 750」黏在一起)。所以歸因改用下面的**對照組**:
 * 同一支 controller、同一份出貨規則,只把 `rounds[1].grantGold` 拿掉,兩邊相減。
 * 那個差才是這個欄位真正付出去的錢。
 *
 * ⚠️ 也沒有 champSelect 預抽乾(`royaleGrants.test.ts` 有一段,因為它量的是
 * 第 7–9 回合)—— 在這裡預抽乾會直接跨過這個檔案唯一要看的那一 tick。
 */
function pursesAtIntermission(ctl: MatchController, round: number): number[] {
  const wallets = (): number[] =>
    [...ctl.seats.values()]
      .filter((s) => s.entityId !== null)
      .map((s) => ctl.world.champion.get(s.entityId!)?.gold ?? 0);

  let guard = 0;
  while (ctl.phase.phase !== "matchEnd" && guard++ < 400_000) {
    const wasPhase = ctl.phase.phase;
    ctl.tick();
    if (ctl.phase.phase === "intermission" && wasPhase !== "intermission" && ctl.phase.round === round) {
      return wallets();
    }
  }
  throw new Error(`round ${round} intermission never happened`);
}

/** 出貨規則,但第 1 回合不發金幣 —— 歸因用的對照組。 */
function withoutRound1Gold(): ArenaRules {
  const rounds = new Map(SHIPPED.rounds);
  const r1 = { ...rounds.get(1)! };
  delete r1.grantGold;
  rounds.set(1, r1);
  return { ...SHIPPED, rounds };
}

const newMatch = (id: string, rules: ArenaRules = SHIPPED): MatchController =>
  new MatchController(id, 20260801, seats(), FAST, 20, rules);

describe("② 行為:第 1 回合的 750 真的進到玩家錢包裡", () => {
  it("開局錢包 = 600 + 750 = 1,350,而拿掉那個欄位就只有 600 —— 差額歸因到 grantGold", () => {
    cover("arena-config-parse");
    const paid = pursesAtIntermission(newMatch("gold-r1"), 1);
    const control = pursesAtIntermission(newMatch("gold-r1-ctl", withoutRound1Gold()), 1);
    expect(paid.length, "12 個座位都要被量到").toBe(12);
    expect(control.length).toBe(12);
    for (let i = 0; i < paid.length; i++) {
      // 對照組 = 只有出生金幣。它同時證明了「1,350 不是因為有人把 750 搬進
      // STARTING_GOLD」—— 那樣的話對照組也會是 1,350。
      expect(control[i], "對照組不該拿到任何回合金幣").toBe(STARTING_GOLD);
      expect(paid[i]! - control[i]!, "第 1 回合的發放").toBe(750);
      expect(paid[i], "出貨的開局錢包").toBe(1350);
    }
  });

  it("⚠️ 1,350 在第一回合的商店就買得起 POWERFUL(1,200)—— 開局決策變了", () => {
    cover("arena-config-parse");
    // owner 應該知道的後果:#82 把 600 的開局purse 設計成「兩件 SIMPLE,或是
    // 存錢等 POWERFUL」。750 讓那個選擇在第一次進商店時就消失了。
    expect(STARTING_GOLD + 750).toBeGreaterThanOrEqual(1200);
    const paid = pursesAtIntermission(newMatch("gold-r1-purse"), 1);
    for (const p of paid) expect(p).toBeGreaterThanOrEqual(1200);
  });
});

// ──────────────────────────────────── ③ 第 11–13 回合今天打不到(量出來的) ──

describe("③ ⚠️ 一場完整的比賽在第 10 回合就結束(量出來的)", () => {
  it("實際打到的最後一個回合 = FINAL_ROUND,之後一個回合都沒有", () => {
    cover("arena-config-parse");
    const ctl = newMatch("gold-cap");
    const roundsPlayed = new Set<number>();
    let guard = 0;
    while (ctl.phase.phase !== "matchEnd" && guard++ < 400_000) {
      if (ctl.phase.phase === "combat") roundsPlayed.add(ctl.phase.round);
      ctl.tick();
    }
    expect(ctl.phase.phase, "比賽必須自然結束,不是被迴圈上限截斷").toBe("matchEnd");
    expect(Math.max(...roundsPlayed), "實際打到的最後一個回合").toBe(FINAL_ROUND);
    expect(FINAL_ROUND).toBe(10);
    for (const r of [FINAL_ROUND + 1, FINAL_ROUND + 2, FINAL_ROUND + 3]) {
      expect(roundsPlayed.has(r), `第 ${r} 回合被打到了 —— 終局回合被抬高了`).toBe(false);
    }
    // …而排程也不再替那些回合準備任何東西。這條斷言把兩件事釘在一起:比賽在第 10
    // 回合結束,而**資料也停在那裡** —— 以前這裡釘的是相反的組合(資料寫到 13、
    // 沒有人領得到),owner 2026-08-18 把那段叫做舊資料並要求搬去 legacy。
    for (const r of [FINAL_ROUND + 1, FINAL_ROUND + 2, FINAL_ROUND + 3]) {
      expect(SHIPPED.rounds.get(r), `第 ${r} 回合還有排程 —— 那是舊資料`).toBeUndefined();
    }
  });
});

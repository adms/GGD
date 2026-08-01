/**
 * owner 2026-08-01 的兩個金幣裁決,以及一個他應該親自看一眼的事實。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 裁決
 * ═══════════════════════════════════════════════════════════════════════════
 *   ②「開局應該是 750」        → `rounds["1"].grantGold` 0(不存在)→ 750
 *   ③「第十回合後,每場都是 +4,000金幣」→ `rounds["11".."13"]` 750 → 4000,
 *      而且 `overflow` 一起改成 4000 / 每回合 +0,否則第 14 回合會掉回 750,
 *      「每場」那三個字在自己的文件裡就不成立。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ owner 一定要看的那一件事:第 11–13 回合現在打不到
 * ═══════════════════════════════════════════════════════════════════════════
 * `PairedDuels.FINAL_ROUND` = 10,而 `MatchController.maybeFinish` 的判斷是
 * `isRoyaleRound(round)`(= `round >= FINAL_ROUND`)—— 第 10 回合的 resolution
 * 一結束,整場就結束了。所以裁決 ③ 落在**三列今天沒有任何一場比賽會讀到的資料**上。
 *
 * 這不是猜的,是這個檔案量出來的:{@link describe} 「④」 跑一場真的 12 人比賽到
 * 自然結束,記下**實際打過的每一個回合**,然後斷言最後一個是 10。
 *
 * 我沒有去動 `FINAL_ROUND` —— owner 說的是金幣,不是場次長度,把比賽從 10 回合
 * 拉長到 13 回合是一個他沒有點頭的玩法改動(每一場會長 30%)。但這條守衛的存在
 * 就是那個決定的存放處:哪天有人把上限抬起來,這裡會紅,而紅的訊息會把他請回來
 * 重看 4,000 這個數字。
 *
 * ⚠️ 順帶一提 `FINAL_ROUND` 本身是一個**寫死的決策點**(CLAUDE.md 第一守則點名
 * 的那個形態,同 `CAPSTONE_ROUND_GATE = 6`)。`PairedDuels.ts` 的檔頭替它辯護過,
 * 但那段辯護講的是「不要做成第十三個建構子參數」,而不是「不要做成 arena-rules
 * 的一個欄位」—— 後者每一條路(伺服器 / replay / 單元測試)讀的都是同一份文件,
 * 沒有它擔心的那個問題。要不要開這個欄位是 owner 的決定,寫在這裡等他裁。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼有「資料」和「行為」兩組斷言
 * ═══════════════════════════════════════════════════════════════════════════
 * 資料斷言(①)只證明檔案裡寫了 750;它對「那 750 有沒有真的進玩家錢包」一個字
 * 都沒說 —— 那正是失敗形態 ⑦(掃屬性代替掃行為)。所以 ② 走真的
 * `MatchController`、真的出貨 `arena-rules.json`,量玩家錢包,而且是**對照組
 * 減實驗組**(細節見 `pursesAtIntermission` 的檔頭:第 1 回合的發放與英雄出生
 * 撞在同一個 tick,所以單純的前後差額分不開 600 與 750)。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 突變紀錄(每一條都真的跑過:改壞 → 確認紅 → 改回 → 確認綠,2026-08-01)
 * ═══════════════════════════════════════════════════════════════════════════
 *   G1. `arena-rules.json` 的 `rounds["1"].grantGold` 整格刪掉(= 動手前的狀態)
 *       ⇒ **3 紅 / 6**(① 的第 1 回合、② 的兩條行為)。
 *   G2. `rounds["11"].grantGold` 改回 750
 *       ⇒ **2 紅 / 6**(① 的 11-13、③ 末尾那條「資料還在而且是對的」)。
 *   G3. `overflow` 改回 750 + 150/回合
 *       ⇒ **1 紅 / 6**(① 的 overflow)。
 */
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

  it("第 11 / 12 / 13 回合 = 各 4,000 金幣", () => {
    cover("arena-config-parse");
    for (const r of [11, 12, 13]) {
      expect(SHIPPED.rounds.get(r)?.grantGold, `round ${r}`).toBe(4000);
    }
  });

  it("overflow 也是 4,000 —— 否則「每場」在第 14 回合就跳票", () => {
    cover("arena-config-parse");
    // owner 說的是「第十回合後,每場」,不是「第 11 到 13 回合」。`overflow` 是
    // 「表以外的每一個回合」的規則,所以它留在 750 + 150/回合 的話,第 14 回合
    // 會從 4,000 掉到 750 —— 一份自相矛盾的文件。
    expect(SHIPPED.overflow?.grantGold).toBe(4000);
    expect(SHIPPED.overflow?.grantGoldPerRound, "逐回合遞增會讓「都是 4,000」變成假的").toBe(0);
    for (const r of [14, 20, 99]) {
      expect(grantForRound(SHIPPED, r)?.grantGold, `overflow round ${r}`).toBe(4000);
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

describe("③ ⚠️ 第 11–13 回合的 4,000 金幣今天沒有任何一場比賽拿得到", () => {
  it("一場完整的比賽在第 10 回合就結束 —— 11/12/13 從來沒有被進入過", () => {
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
    for (const r of [11, 12, 13]) {
      expect(
        roundsPlayed.has(r),
        `第 ${r} 回合被打到了 —— 場次上限被抬高了,那 owner 的 +4,000 需要重新被看一次` +
          `(它從此是玩家真的會拿到的錢,而不是一列休眠的資料)`,
      ).toBe(false);
    }
    // …而那三列資料**還在**,而且是對的。這條斷言把兩件事釘在一起:資料照 owner
    // 說的寫了,但今天沒有人領得到。刪掉其中任何一半都會讓下一個讀的人誤會。
    for (const r of [11, 12, 13]) expect(SHIPPED.rounds.get(r)?.grantGold).toBe(4000);
  });
});

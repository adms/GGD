/**
 * 回合發放倍率 `goldRoundPayout` (owner 2026-08-04「金錢發放有點太浮濫了…分為
 * 回合發放倍率, 打殭屍發放倍率, 擊敗英雄發放倍率, 完成任務發放倍率 四種」，
 * 打殭屍那一格同日再拆成 `goldMobKill` / `goldEliteKill`).
 *
 * 另外四類（一般殭屍／特殊殭屍與王／英雄／任務）的守衛在
 * `packages/shared/src/sim/economy/goldPayoutMultipliers.test.ts` —— 它們的發放點
 * 都在 sim 裡。**回合這一類不在那裡**：它的發放點全部在這個檔的
 * `MatchController`（開局購物金、arena-rules 的每回合排程、回合勝／負／輪空、
 * 決賽結算），所以它只能在這裡量，而且必須跑**一場真的比賽**（失敗形態 ⑤：
 * 被測的不是出貨的那個）。
 *
 * ⚠️ 為什麼量的是**絕對值配上對照組**，不是前後差額：第 1 回合的排程發放與英雄
 * 出生落在**同一個 tick**（`roundGoldOwner.test.ts` 的檔頭把這件事量過），前一
 * tick 根本沒有錢包可以取樣。所以歸因靠「同一支 controller、同一份出貨規則，只
 * 換 combatEnv」的兩次跑。
 *
 * ③ 期望值一律從 `STARTING_GOLD` 與**出貨的 arena-rules** 推導，沒有抄任何出貨
 *    數字進斷言 —— owner 每週在改 750 / 4,000 那些數。
 *
 * ── 突變紀錄（改壞 → 確認紅 → 改回 → 確認綠，2026-08-04）─────────────────
 *
 *   M4. `MatchController` 開局購物金那一行的 `"round"` 改成 `"unscaled"`
 *       ⇒ **3 紅 / 5**（減半、歸零、以及「開局購物金也在回合這一格裡」三條）。
 *   M5. 每回合排程那一行 `grant.grantGold` 的 `"round"` 改成 `"hero"`（接錯線）
 *       ⇒ **4 紅 / 5**（① 出貨值那條也紅了 —— 排程金被乘上英雄那一格,而測試裡
 *          英雄格是 1.0,所以金額只在「回合格不是 1」時才對得起來:減半、歸零、
 *          「關掉別人不受影響」與 ① 全部落空,只剩最後一條純看歸零的還綠）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { STARTING_GOLD } from "@ggd/shared/sim/economy/progression";
import {
  COMBAT_ENV_DEFAULTS,
  normalizeCombatEnv,
  type CombatEnvKey,
  type CombatEnvMultipliers,
} from "@ggd/shared/sim/combatEnv";
import { MatchController, type SeatSpec } from "./MatchController";
import { resolveArenaRules, grantForRound, type ArenaRules } from "./arenaRules";

/** 出貨的 arena-rules —— 從 content/ 載入，永遠不是 fixture。 */
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
    championId: "godie-h01o",
  }));

const env = (over: Partial<Record<CombatEnvKey, number>> = {}): CombatEnvMultipliers =>
  normalizeCombatEnv(over);

/** 跑到第 1 回合 intermission 進入的那一 tick，回傳每個座位的錢包。 */
function pursesAtFirstIntermission(combatEnv: CombatEnvMultipliers): number[] {
  const ctl = new MatchController(
    "gold-round-mult",
    20260804,
    seats(),
    FAST,
    20,
    SHIPPED,
    undefined,
    undefined,
    combatEnv,
  );
  let guard = 0;
  while (ctl.phase.phase !== "matchEnd" && guard++ < 400_000) {
    const was = ctl.phase.phase;
    ctl.tick();
    if (ctl.phase.phase === "intermission" && was !== "intermission" && ctl.phase.round === 1) {
      return [...ctl.seats.values()]
        .filter((s) => s.entityId !== null)
        .map((s) => ctl.world.champion.get(s.entityId!)?.gold ?? 0);
    }
  }
  throw new Error("第 1 回合的 intermission 從來沒有發生");
}

/** 出貨值下，第 1 回合 intermission 應該有的錢包（出生金 + 第 1 回合排程金）。 */
function shippedOpeningPurse(): number {
  return STARTING_GOLD + (grantForRound(SHIPPED, 1)?.grantGold ?? 0);
}

describe("回合發放倍率 —— 跑一場真的比賽量錢包", () => {
  it("★ ① 出貨值 1.0：開局錢包跟加倍率之前逐位元相同", () => {
    cover("arena-config-parse");
    expect(COMBAT_ENV_DEFAULTS.goldRoundPayout, "出貨值必須是中性的 1.0").toBe(1);
    const purses = pursesAtFirstIntermission(COMBAT_ENV_DEFAULTS);
    expect(purses.length, "12 個座位都要被量到").toBe(12);
    for (const p of purses) expect(p).toBe(shippedOpeningPurse());
  });

  it("★ 設 0.5 → 開局購物金與第 1 回合排程金一起減半", () => {
    cover("arena-config-parse");
    const purses = pursesAtFirstIntermission(env({ goldRoundPayout: 0.5 }));
    const expected =
      Math.round(STARTING_GOLD * 0.5) + Math.round((grantForRound(SHIPPED, 1)?.grantGold ?? 0) * 0.5);
    expect(expected, "對照值算出來跟出貨值一樣的話這條就測不到東西").toBeLessThan(
      shippedOpeningPurse(),
    );
    for (const p of purses) expect(p).toBe(expected);
  });

  it("★ 設 0 → 開局身上一毛錢都沒有（「完全不發」真的做得到）", () => {
    cover("arena-config-parse");
    for (const p of pursesAtFirstIntermission(env({ goldRoundPayout: 0 }))) expect(p).toBe(0);
  });

  it("★ 把殭屍兩格／英雄／任務關掉，回合發放完全不受影響", () => {
    cover("arena-config-parse");
    const purses = pursesAtFirstIntermission(
      env({ goldMobKill: 0, goldEliteKill: 0, goldHeroKill: 0, goldQuest: 0 }),
    );
    for (const p of purses) {
      expect(p, "回合發放讀到了別人的那一格 —— 四個欄位最典型的接錯線").toBe(
        shippedOpeningPurse(),
      );
    }
  });

  it("★ 開局購物金本身也在回合這一格裡（不是只有排程那一筆被乘到）", () => {
    cover("arena-config-parse");
    // 出生金 600 是一個**沒有其他後台欄位可以碰**的常數（config.match 的
    // economy.startingGold 是唯讀且無人讀取的），所以它有沒有跟著倍率走，是
    // owner 需要知道的一件事，也是這條守衛釘住的那個決定。
    const zeroRound = pursesAtFirstIntermission(env({ goldRoundPayout: 0 }));
    expect(STARTING_GOLD, "出生金是 0 的話這條守衛失去主體").toBeGreaterThan(0);
    for (const p of zeroRound) expect(p).toBe(0); // 排程金歸零 + 出生金也歸零
  });
});

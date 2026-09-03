/**
 * ⭐⭐ 「**一場比賽的錢怎麼流**」的四個數字 —— ⛔ 在此之前只有改程式碰得到。
 *
 * ⚠️ ⭐ 這一族在 CLAUDE.md 裡是**被逐字點名的前科**：
 *
 * > | 寫死的決策 | 代價 |
 * > | `CAPSTONE_ROUND_GATE = 6` | 實打每場只有 5–6 回合 → #82 的 7,500 金頂點路線**永遠開不了** |
 * > | `STAT_TICK_TARGET = 20` | 同上，兩個常數乘起來變成不可能，而且**後台一個都改不到** |
 *
 * ⇒ ⭐ 這一支就是把那兩行從「代價」變成「一格下拉選單」。
 *
 * ── ⛔⛔ ⭐ 上面那張表**兩欄都已經過期了**（回驗於 2026-09-03，GH#972）──────
 * ⚠️ 它是引言，⛔ 不是現況 —— 而一句在它到期之後還活著的散文會讓下一個人做錯
 * 決定（第三守則）。逐條回驗：
 *
 * | 那句話說 | ⭐ 今天量到的 |
 * |---|---|
 * | 「**後台一個都改不到**」 | ⛔ **兩格都改得到**：`config.match@1` 的 `economy.statTickTarget` / `economy.capstoneRoundGate`（Zod 有上下界，後台「對戰設定」頁編得到），`MatchController` 在 tick 0 之前灌進 `world.economy` |
 * | 「**實打每場只有 5–6 回合**」⇒ 第 6 回合的閘**永遠開不了** | ⛔ `content/config/arena-rules.json` 的 `finalRound` 是 **10**，`rounds` 表也有 10 筆 ⇒ ⭐ 第 6 回合的閘**這一場真的走得到** |
 *
 * ⇒ ⭐ 所以今天的缺口**不是機制、也不是可調性**，是**玩家不知道它存在** ——
 * 那條路線的進度與「買一件道具就歸零」的規則畫在哪裡，見
 * `apps/client/src/ui/panels/statPathReadout.ts`（GH#972）。
 * ⚠️ ⭐ CLAUDE.md 的那一格**仍然寫著舊的兩句**（它是原始出處）——
 * ⛔ 這裡不代它改，那是 owner 的文件。
 *
 * ── ⛔ 這一支**刻意不收** `GOLD_PER_AEP` ──────────────────────────────────
 * ⭐ 它**零個讀取端**（全 repo 只有宣告那一行）—— 它記錄的是 `itemTiers.ts` 裡
 * 那張價目表**當初怎麼推導出來的**。⇒ 把它做成一格設定會是**一個謊**：
 * 轉那一格不會改變任何價格（價格是烘進表裡的字面值）。
 * ⭐ 可反駁：哪天價目表改成**在載入時**從這個匯率算出來（那才是第〇·四守則要的形狀），
 * 它就要搬進這裡。
 *
 * ⚠️ 讀的時候一律走 `economyRules(world)`。
 */
import type { SimWorld } from "../SimWorld";

export interface EconomyRules {
  /** 傳說寶玉一次的價錢（`itemTiers.ts` 的 `LEGENDARY_ORB_PRICE`）。 */
  legendaryOrbPrice: number;
  /** 一次屬性精粹的價錢（`STAT_TICK_PRICE`）。 */
  statTickPrice: number;
  /**
   * 累積幾次精粹解鎖頂點（`STAT_TICK_TARGET`）。
   * ⚠️ ⭐ 它與 `capstoneRoundGate` **相乘**才是「這條路線打不打得開」——
   * CLAUDE.md 逐字：「兩個常數乘起來變成不可能」。⇒ 調一個之前先看另一個。
   */
  statTickTarget: number;
  /** 第幾回合起頂點才解鎖（`statPath.ts` 的 `CAPSTONE_ROUND_GATE`）。 */
  capstoneRoundGate: number;
  /**
   * ⭐⭐ **頂點加成的劣勢加權強度**（GH#897）—— owner 2026-09-01 逐字：
   * > 「隨機能力20次後的額外%加成，根據玩家目前**排名&積分**來做權重調整，
   * >  也就是**越排後的玩家額外%加成越高**，讓劣勢方有機會翻盤」
   *
   * ⭐ 最終抽出的百分比 ＝ `roll × (1 + 這一格 × D)`，D ∈ [0,1] 是**出貨的**
   * `disadvantageScore()` 算的（回合差 · 裝備價值差 · 近況三項加權）。
   * ⛔ 這裡**不再寫第二套劣勢公式** —— 武器階級那一族已經有一份（第〇·四守則）。
   *
   * ⭐⭐ **出貨 `0` ＝ 關掉（逐位元回到今天）** ——
   * ⚠️ 它改變每一場比賽的結果，⛔ 而 owner 只說了「要有」，沒說要多強。
   * ⇒ 這一格存在是為了讓他**改一個下拉選單**就能試（第一守則：可調 ≠ 我可以轉）。
   */
  capstoneDisadvantageFactor: number;
  /**
   * 助攻認定窗（tick，30Hz ⇒ 300 ＝ 10 秒；`stats/matchStats.ts` 的 `ASSIST_WINDOW_TICKS`）。
   * ⛔ **連殺窗不在這裡** —— 它被客戶端音效共用，理由見 `codeOnlyKnobs.test.ts` 的豁免表。
   */
  assistWindowTicks: number;
  /**
   * ⭐ GH#910 —— 回合給等**保不保留**經驗條上的餘額。
   * ⛔ false（舊行為）＝ 只補差額 ⇒ 玩家累積的進度被系統吸收掉
   *   （量到：中等強度的玩家**打的殭屍有六到七成白打**）。
   * ⭐ true（出貨）＝ 給滿一整級的量，餘額往上疊。
   */
  roundGrantKeepsRemainder: boolean;
}

/** ⭐ 出貨值 —— **逐格等於**它搬過來之前的那個常數。 */
export const DEFAULT_ECONOMY: EconomyRules = Object.freeze({
  legendaryOrbPrice: 2400,
  statTickPrice: 375,
  statTickTarget: 20,
  capstoneRoundGate: 6,
  // ⭐ GH#897 —— 出貨 0 ＝ 關（它改變每一場比賽的結果，而 owner 沒說要多強）。
  capstoneDisadvantageFactor: 0,
  assistWindowTicks: 300,
  roundGrantKeepsRemainder: true,
});

/** ⚠️ 與 Zod 那一份**逐字相同**。 */
const BOUNDS: Readonly<Partial<Record<keyof EconomyRules, readonly [number, number]>>> = Object.freeze({
  legendaryOrbPrice: [0, 100000],
  statTickPrice: [0, 100000],
  // ⛔ 下界 1：0 次精粹 = 開場就有頂點，那不是「便宜」，是機制消失。
  statTickTarget: [1, 200],
  // ⭐ 0 = 不設回合閘（第一回合就開得了）。⚠️ 上界刻意寬：一場實打 5–6 回合，
  //   而 owner 想做長局的時候不該被這一格擋住。
  capstoneRoundGate: [0, 60],
  // ⭐ 0 = 關；2 = 最劣勢方拿到三倍。上界 5 是「翻盤」與「送分」的分界。
  capstoneDisadvantageFactor: [0, 5],
  assistWindowTicks: [0, 36000],
});

export function normalizeEconomyRules(raw: unknown): EconomyRules {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const out = { ...DEFAULT_ECONOMY } as Record<string, number | boolean>;
  for (const k of Object.keys(DEFAULT_ECONOMY) as (keyof EconomyRules)[]) {
    const v = r[k];
    // ⭐ 布林那一格（`roundGrantKeepsRemainder`）沒有上下界 —— 它只有兩個狀態。
    if (typeof DEFAULT_ECONOMY[k] === "boolean") {
      if (typeof v === "boolean") (out as Record<string, unknown>)[k] = v;
      continue;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const [lo, hi] = BOUNDS[k]!;
    out[k] = Math.min(hi, Math.max(lo, v));
  }
  return Object.freeze(out) as unknown as EconomyRules;
}

/** ⭐ **唯一**的讀法。缺格 ⇒ 出貨值 ⇒ 行為逐位元不變。 */
export function economyRules(world: SimWorld): EconomyRules {
  return world.economy ?? DEFAULT_ECONOMY;
}

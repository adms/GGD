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
}

/** ⭐ 出貨值 —— **逐格等於**它搬過來之前的那個常數。 */
export const DEFAULT_ECONOMY: EconomyRules = Object.freeze({
  legendaryOrbPrice: 2400,
  statTickPrice: 375,
  statTickTarget: 20,
  capstoneRoundGate: 6,
});

/** ⚠️ 與 Zod 那一份**逐字相同**。 */
const BOUNDS: Readonly<Record<keyof EconomyRules, readonly [number, number]>> = Object.freeze({
  legendaryOrbPrice: [0, 100000],
  statTickPrice: [0, 100000],
  // ⛔ 下界 1：0 次精粹 = 開場就有頂點，那不是「便宜」，是機制消失。
  statTickTarget: [1, 200],
  // ⭐ 0 = 不設回合閘（第一回合就開得了）。⚠️ 上界刻意寬：一場實打 5–6 回合，
  //   而 owner 想做長局的時候不該被這一格擋住。
  capstoneRoundGate: [0, 60],
});

export function normalizeEconomyRules(raw: unknown): EconomyRules {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const out = { ...DEFAULT_ECONOMY } as Record<string, number>;
  for (const k of Object.keys(DEFAULT_ECONOMY) as (keyof EconomyRules)[]) {
    const v = r[k];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const [lo, hi] = BOUNDS[k];
    out[k] = Math.min(hi, Math.max(lo, v));
  }
  return Object.freeze(out) as unknown as EconomyRules;
}

/** ⭐ **唯一**的讀法。缺格 ⇒ 出貨值 ⇒ 行為逐位元不變。 */
export function economyRules(world: SimWorld): EconomyRules {
  return world.economy ?? DEFAULT_ECONOMY;
}

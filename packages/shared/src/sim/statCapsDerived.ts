/**
 * ⛔ **產生的檔案 —— 一個字都不要手改。** `pnpm statcaps:build`
 *（產生器：tools/stat-caps/gen_stat_caps.ts，規則：sim/statCapDerivation.ts）
 *
 * 這 7 個數字是「**出貨母體在錨點等級的基礎空間中位數 × 200**」。
 * ⚠️ 它們是**基礎空間**的（⛔ 不含 `combat-env` 的 ×factor）——
 * 引擎在 `statCaps.ts::capCeiling()` 讀取時才乘 env 鏈，而且**只乘一次**。
 * 那正是 owner 2026-08-20「echo and loop back the formula」指的那個迴圈的修法。
 *
 * 它紅了（`statcaps:check`）不要改它，跑 `pnpm statcaps:build` 然後 `git add`。
 */
import { Stat } from "./stats/statTypes";

/** 一格天花板。與 `statCaps.ts` 的 `StatCap` 同構（⛔ 不 import，避免產生檔依賴它）。 */
export interface DerivedStatCap {
  readonly base: number;
  readonly unlocked: number;
}

/** 這一批數字是怎麼來的 —— 讓後台 / 文件 / Codex 契約**引用**而不是各自複述。 */
export interface DerivedCapProvenance {
  /** 量測用的等級（= `STAT_CAP_ANCHOR_LEVEL`） */
  readonly anchorLevel: number;
  /** owner 的倍率（= `STAT_CAP_MULTIPLE`） */
  readonly multiple: number;
  /** 母體大小 —— **對戰可選本體**（⛔ 不含變身態／骨架／退場） */
  readonly population: number;
  /** 每條屬性在錨點的**基礎空間**中位數 */
  readonly medians: Readonly<Partial<Record<Stat, number>>>;
}

export const DERIVED_CAP_PROVENANCE: DerivedCapProvenance = Object.freeze({
  anchorLevel: 30,
  multiple: 200,
  population: 49,
  medians: Object.freeze({
  "maxHealth": 2808.6,
  "maxMana": 1725.25,
  "healthRegen": 5.668,
  "manaRegen": 16.3575,
  "ad": 104.74,
  "armor": 39.695,
  "mr": 62.8,
  }),
});

export const DERIVED_STAT_CAPS: Readonly<Partial<Record<Stat, DerivedStatCap>>> = Object.freeze({
  "maxHealth": Object.freeze({ base: 561720, unlocked: 561720 }),
  "maxMana": Object.freeze({ base: 345050, unlocked: 345050 }),
  "healthRegen": Object.freeze({ base: 1134, unlocked: 1134 }),
  "manaRegen": Object.freeze({ base: 3271, unlocked: 3271 }),
  "ad": Object.freeze({ base: 20948, unlocked: 20948 }),
  "armor": Object.freeze({ base: 7939, unlocked: 7939 }),
  "mr": Object.freeze({ base: 12560, unlocked: 12560 }),
});

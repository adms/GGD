/**
 * hudScale — 玩家自選的 HUD 縮放檔位（owner 2026-08-10）。
 *
 * owner 逐字：「技能圖標跟對手角色的資訊包含**整體圖案框架與字體**可以依照使用者
 * 自行設定 [最大300%, 極大200%, 大150%, 中(目前預設), 小(80%), 極小(50%), 最小(10%)]」
 * ——「最大適合 32吋以上螢幕觀看, 最小適合 iphone手機觀看, 小適合ipad,
 *    中適合13~15吋 macbook」。
 *
 * 這一份是**純資料 + 一個算子**，沒有 React、沒有 settings singleton、沒有
 * localStorage —— 所以它在 node 測試裡可以直接算，而且 `hudLayout.ts` /
 * `hudBottomCluster.ts` 這種純幾何模組可以安全地 import 它。
 * 設定 → 這裡的橋接住在 `settings/hudScaleBinding.ts`（形狀照抄
 * `vfx/goreSettings.ts`），方向嚴格是 settings → HUD。
 *
 * ⚠️ **一個算子，不是每個元件各自乘**（CLAUDE.md 第零守則⑨）。技能列、觸控技能
 * 環、敵方面板加起來有數十個寫死的 px；它們全部走 `hudScale()`，不要有第二個
 * 「× tier」的地方，否則下次改一個檔位就要 grep 三個檔。
 *
 * ⚠️ **出貨預設是「中」＝ 1.00，而且 1.00 必須逐位元等於今天的數字** ——
 * 「不改設定的人畫面一格都不能變」是硬要求。`hudScale(px,"medium") === px`
 * 由守衛釘住（`hudScale.test.ts`）。
 */
// ⚠️ 這一行是一個**刻意的環**：`hudLayout.ts` 之後會 import 這個模組（enemy-team
// 的高度要跟著縮）。所以這裡對 `HUD_TOUCH_TARGET` 的讀取一律**延遲到呼叫時**
// （見 `shippedPolicy()`），⛔ 不要把它寫進任何 module-level 的 const —— 那會在
// 某一個進入順序下讀到 TDZ 的 const 而整個 HUD 炸掉。44 仍然只有一個住處。
import { HUD_TOUCH_TARGET } from "./hud/hudLayout";

/* ═══════════════════════════════════════════════════════════════════════════
 * 七個檔位（純資料）
 * ═══════════════════════════════════════════════════════════════════════════ */

export type HudScaleTier =
  | "max" // 最大 300%
  | "xlarge" // 極大 200%
  | "large" // 大 150%
  | "medium" // 中 100%（出貨預設）
  | "small" // 小 80%
  | "xsmall" // 極小 50%
  | "min"; // 最小 10%

export interface HudScaleTierSpec {
  readonly id: HudScaleTier;
  /** 倍率，套在**所有**尺寸上：框、邊、內距、圓角、字級（owner 說「整體圖案框架與字體」）。 */
  readonly mult: number;
  /** 中文檔位名（設定頁的按鈕字）。 */
  readonly label: string;
  /**
   * 適用場景。owner **特地**講了螢幕尺寸，所以它是資料的一部分，
   * ⛔ 不可以散在 UI 元件裡，也 ⛔ 不可以只顯示倍率。
   * 沒被 owner 點名的檔位留空字串 —— 編一個假的螢幕尺寸比不寫更糟。
   */
  readonly useCase: string;
}

/**
 * 大 → 小 排列（設定頁的 Segmented 就是這個順序）。
 * `mult` 直接就是 owner 給的百分比，⛔ 不要在別處再推導一次。
 */
export const HUD_SCALE_TIERS: readonly HudScaleTierSpec[] = [
  { id: "max", mult: 3.0, label: "最大", useCase: "32 吋以上螢幕" },
  { id: "xlarge", mult: 2.0, label: "極大", useCase: "" },
  { id: "large", mult: 1.5, label: "大", useCase: "" },
  { id: "medium", mult: 1.0, label: "中", useCase: "13~15 吋 MacBook" },
  { id: "small", mult: 0.8, label: "小", useCase: "iPad" },
  { id: "xsmall", mult: 0.5, label: "極小", useCase: "" },
  { id: "min", mult: 0.1, label: "最小", useCase: "iPhone" },
];

/** 出貨預設 = 中 = 100% = 今天的行為。⛔ 這一格不可以改成別的。 */
export const DEFAULT_HUD_SCALE_TIER: HudScaleTier = "medium";

const BY_ID = new Map<HudScaleTier, HudScaleTierSpec>(HUD_SCALE_TIERS.map((t) => [t.id, t]));

export function isHudScaleTier(v: unknown): v is HudScaleTier {
  return typeof v === "string" && BY_ID.has(v as HudScaleTier);
}

/** 檔位的完整資料（未知值 → 中，永遠不 throw：一個壞掉的存檔要落回今天的行為）。 */
export function hudScaleSpec(tier: HudScaleTier = hudScaleTier()): HudScaleTierSpec {
  return BY_ID.get(tier) ?? (BY_ID.get(DEFAULT_HUD_SCALE_TIER) as HudScaleTierSpec);
}

/** 倍率本身（給 transform / 非 px 的用途，例如 `scale()` 或百分比幾何）。 */
export function hudScaleMult(tier: HudScaleTier = hudScaleTier()): number {
  return hudScaleSpec(tier).mult;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 觸控下限 —— 這是一個決策點，所以它是資料不是 if
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 「縮放不可以讓一個按鈕變成點不到的東西」。最小檔位 10% 會把一個 52px 的技能
 * 圖示縮成 5.2px —— 那不是「小」，那是「壞了」。
 *
 * ⚠️ 但下限**只能往下擋，不可以往上推**：如果它會把今天就已經小於 44px 的東西
 * （例如升級 `+` 鈕）在「中」檔位放大，那預設檔位的畫面就變了，直接違反
 * 「不改設定的人畫面一格都不能變」。所以規則是
 *   `max(縮完的值, min(原始值, 下限))`
 * ——「縮放最多只能把它縮到它今天的大小與下限之中比較小的那個」。
 *
 * 兩格都是**決策點**（第一守則）：要不要套用、下限是多少。預設 = 套用、
 * 44px（Apple HIG，`hudLayout.ts` 的 `HUD_TOUCH_TARGET`，⛔ 全 repo 同一個數字）。
 */
export interface HudScalePolicy {
  /** 要不要對可點擊元素套用下限。false = 照實縮（owner 說 10% 就給我 10%）。 */
  readonly enforceTouchFloor: boolean;
  /** 下限 px。⛔ 不要在這裡寫 44 —— 見 `shippedPolicy()`。 */
  readonly touchTargetFloorPx: number;
}

/**
 * ⚠️ **這裡是函式而不是 const，是為了避開循環 import 的 TDZ。**
 * `hudLayout.ts` 會 import 這個模組（enemy-team 的高度要跟著縮），所以
 * hudScale → hudLayout → hudScale 是一個環；模組**載入時**去讀
 * `HUD_TOUCH_TARGET` 會在某一個進入順序下拿到 TDZ 的 const 而炸掉。
 * 在**呼叫時**才讀就永遠安全，而且 44 仍然只有一個住處。
 */
function shippedPolicy(): HudScalePolicy {
  return { enforceTouchFloor: true, touchTargetFloorPx: HUD_TOUCH_TARGET };
}

let policyOverride: Partial<HudScalePolicy> | null = null;

/** 覆寫政策（`null` = 回到出貨值）。給後台/內容層與測試用，形狀同 `applyGoreDoc`。 */
export function applyHudScalePolicy(partial: Partial<HudScalePolicy> | null): void {
  policyOverride = partial;
}

/** 現在真的在用的政策。 */
export function hudScalePolicy(): HudScalePolicy {
  const base = shippedPolicy();
  if (!policyOverride) return base;
  const floor = policyOverride.touchTargetFloorPx;
  return {
    enforceTouchFloor: policyOverride.enforceTouchFloor ?? base.enforceTouchFloor,
    touchTargetFloorPx:
      typeof floor === "number" && Number.isFinite(floor) && floor >= 0
        ? floor
        : base.touchTargetFloorPx,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 算子
 * ═══════════════════════════════════════════════════════════════════════════ */

/** 0.1px 解析度：字級要允許小數（不然 0.8 檔位的 9px 字會跳格），但不要留浮點雜訊。 */
function round(px: number): number {
  return Math.round(px * 10) / 10;
}

/**
 * 把一個**基準尺寸**（今天寫在元件裡的那個 px）換成該檔位的實際尺寸。
 * 框、邊、內距、圓角、字級、gap 全部走這一支。
 *
 * `hudScale(px, "medium") === px`（逐位元），這是預設檔位不變的保證。
 */
export function hudScale(px: number, tier: HudScaleTier = hudScaleTier()): number {
  if (!Number.isFinite(px)) return 0;
  const mult = hudScaleMult(tier);
  return mult === 1 ? px : round(px * mult);
}

/**
 * 同上，但這個尺寸是**可點擊元素**的邊長 —— 套用觸控下限（見 `HudScalePolicy`）。
 * 技能圖示 tile、升級鈕、觸控技能環的按鈕用這一支；它們旁邊的字用 `hudScale`。
 */
export function hudScaleTappable(px: number, tier: HudScaleTier = hudScaleTier()): number {
  const scaled = hudScale(px, tier);
  const { enforceTouchFloor, touchTargetFloorPx } = hudScalePolicy();
  if (!enforceTouchFloor) return scaled;
  // ⛔ 承重的一行：下限只能往下擋。`Math.min(px, floor)` 保證它永遠不會把一個
  // 本來就比 44 小的按鈕放大，也就保證了「中」檔位逐位元不變。
  return Math.max(scaled, Math.min(px, touchTargetFloorPx));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * runtime seam —— 形狀照抄 hudBottomCluster.applyHudClusterOverride
 * ═══════════════════════════════════════════════════════════════════════════ */

let activeTier: HudScaleTier = DEFAULT_HUD_SCALE_TIER;

/**
 * 裝上玩家選的檔位（`null` / 未知值 = 回到出貨預設「中」）。
 * 由 `settings/hudScaleBinding.ts` 在開機時呼叫一次並訂閱後續變更。
 */
export function applyHudScale(tier: HudScaleTier | null | undefined): void {
  activeTier = isHudScaleTier(tier) ? tier : DEFAULT_HUD_SCALE_TIER;
}

/** 現在正在排版的檔位。元件不必自己傳 tier，直接呼叫 `hudScale(px)` 就好。 */
export function hudScaleTier(): HudScaleTier {
  return activeTier;
}

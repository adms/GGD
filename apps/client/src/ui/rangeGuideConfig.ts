/**
 * rangeGuideConfig — `config.range-guide@1` 的 client 端**現值** (GH#376).
 *
 * ── 這個檔在解決什麼 ───────────────────────────────────────────────────────
 * GH#367 把技能範圍指引的六個決策點收斂成 `abilityRangeGuide.ts` 裡的一個具名
 * 物件。那比散在三個檔的魔術數字好，但**它還不是第一守則要的東西**：改一個
 * 數字仍然等於改程式 → rebuild → 重啟容器。這個檔是那份帳單的另一半 ——
 * 一份真的 `config.*@1` 落地之後，值從後台來。
 *
 * 形狀逐字照抄 `predict/predictionHold.ts`（也就是 `applyGoreDoc` /
 * `applyStealthDoc` 那一族）：
 *
 *   1. 從一份 `config.range-guide@1` 文件把值讀出來（`applyRangeGuideDoc`）；
 *   2. 存成模組級現值，讓渲染層每一幀零成本讀到（`rangeGuide()`）；
 *   3. 把**預告通道**那一半推進 `vfx/telegraphChannel`（見下面那一段）。
 *
 * ⚠️ 為什麼是模組級現值而不是建構參數：內容是**非同步**載入的
 * （`ContentDb.load()` 在 `GameApp` 建好之後才 resolve），而一場比賽可能在內容
 * 抵達之前就開始。存成現值 = 內容一到就生效，不必重建任何東西。
 *
 * ── 為什麼**推**進 telegraphChannel，而不是讓它來拉 ────────────────────────
 * `paletteFor()` 在每一次施法起手被叫到，而值只在「後台存過 + 玩家重整」時變。
 * 拉的寫法要嘛每次合併一個新物件（配置一顆垃圾），要嘛在那邊再做一次快取 ——
 * 兩者都是把同一個決定寫兩遍。推的寫法讓 `paletteFor` 維持一行查表，
 * 而且 `telegraphChannel.ts` 的三個出貨常數維持**同一顆物件**（`paletteFor` 的
 * 既有守衛用 `toBe` 比對它們）。
 *
 * ⛔ 少了 `ContentDb.load()` 裡那一行 `applyRangeGuideDoc(...)`，這整份 JSON
 * 就是一份沒有人讀的檔案：後台存得起來、頁面重整還讀得回自己填的值，而場上
 * 一輩子看不到（失敗形態②）。守衛在 `rangeGuideWiring.test.ts`。
 */
import { applyTelegraphChannelStyles } from "../vfx/telegraphChannel";

/** RGB 三元組（Babylon `Color3` 的參數，0..1）—— 這個檔刻意不 import 渲染型別。 */
export type Rgb01 = readonly [number, number, number];

/** 一條地面預告通道解析後的樣子。 */
export interface TelegraphChannelValues {
  ring: Rgb01;
  fill: Rgb01;
  alpha: number;
  dashed: boolean;
  pulseHz: number;
}

/** 這一場實際生效的全部值。 */
export interface RangeGuideValues {
  hoverDelayMs: number;
  hoverOpensBanner: boolean;
  rangeRgb: Rgb01;
  rangeFillAlpha: number;
  aoeRgb: Rgb01;
  aoeFillAlpha: number;
  rimAlpha: number;
  rimThickness: number;
  telegraph: {
    self: TelegraphChannelValues;
    ally: TelegraphChannelValues;
    incoming: TelegraphChannelValues;
  };
}

/**
 * 出貨值 —— **逐格等於 `content/config/range-guide.json`**，形態也一樣（hex 字串
 * 而不是解析好的三元組），這樣 `rangeGuideWiring.test.ts` 那條漂移守衛可以直接
 * 逐格比對兩者，⛔ 不必在測試裡抄第三份數字。
 *
 * ⚠️ 它必須存在：內容是非同步載入的，而首次繪製不等它（`main.tsx` 的 fail-open）。
 * 「缺文件 = 出貨值」，⛔ 不是「缺文件 = 沒有指引」。
 */
export const SHIPPED_RANGE_GUIDE = {
  hoverDelayMs: 140,
  hoverOpensBanner: false,
  rangeColor: "#73BFFF",
  rangeFillAlpha: 0.09,
  aoeColor: "#FF9E3B",
  aoeFillAlpha: 0.2,
  rimAlpha: 0.85,
  rimThickness: 0.18,
  telegraph: {
    self: { ring: "#FF9E3B", fill: "#FF9E3B", alpha: 0.6, dashed: true, pulseHz: 0 },
    ally: { ring: "#59CCFF", fill: "#59CCFF", alpha: 0.45, dashed: false, pulseHz: 0 },
    incoming: { ring: "#FF3824", fill: "#FF5C33", alpha: 0.95, dashed: false, pulseHz: 6 },
  },
} as const;

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/** `#rrggbb` → 0..1 三元組；認不得的字串退回 `fallback`（同一支 Zod 的規則）。 */
function rgb(candidate: unknown, fallback: string): Rgb01 {
  const hex = typeof candidate === "string" && HEX6.test(candidate) ? candidate : fallback;
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** 數字欄位：非有限數 / 超出上下界 → 出貨值（後台與 Zod 兩層已經擋在前面）。 */
function num(candidate: unknown, fallback: number, min: number, max: number): number {
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate >= min && candidate <= max
    ? candidate
    : fallback;
}

function bool(candidate: unknown, fallback: boolean): boolean {
  return typeof candidate === "boolean" ? candidate : fallback;
}

/**
 * 一條通道的出貨值**加寬**過的型別。
 *
 * ⚠️ ⛔ 不可以寫成 `typeof SHIPPED_RANGE_GUIDE["telegraph"]["self"]`：那張表是
 * `as const`，所以那個型別是**字面值**（`ring: "#FF9E3B"`），另外兩條通道當場
 * 塞不進去。
 */
interface ShippedChannel {
  ring: string;
  fill: string;
  alpha: number;
  dashed: boolean;
  pulseHz: number;
}

function channel(raw: unknown, base: ShippedChannel): TelegraphChannelValues {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    ring: rgb(r.ring, base.ring),
    fill: rgb(r.fill, base.fill),
    alpha: num(r.alpha, base.alpha, 0, 1),
    dashed: bool(r.dashed, base.dashed),
    pulseHz: num(r.pulseHz, base.pulseHz, 0, 20),
  };
}

function decode(raw: Record<string, unknown>): RangeGuideValues {
  const S = SHIPPED_RANGE_GUIDE;
  const tele = (raw.telegraph ?? {}) as Record<string, unknown>;
  return {
    hoverDelayMs: num(raw.hoverDelayMs, S.hoverDelayMs, 0, 2000),
    hoverOpensBanner: bool(raw.hoverOpensBanner, S.hoverOpensBanner),
    rangeRgb: rgb(raw.rangeColor, S.rangeColor),
    rangeFillAlpha: num(raw.rangeFillAlpha, S.rangeFillAlpha, 0, 1),
    aoeRgb: rgb(raw.aoeColor, S.aoeColor),
    aoeFillAlpha: num(raw.aoeFillAlpha, S.aoeFillAlpha, 0, 1),
    rimAlpha: num(raw.rimAlpha, S.rimAlpha, 0, 1),
    rimThickness: num(raw.rimThickness, S.rimThickness, 0.01, 2),
    telegraph: {
      self: channel(tele.self, S.telegraph.self),
      ally: channel(tele.ally, S.telegraph.ally),
      incoming: channel(tele.incoming, S.telegraph.incoming),
    },
  };
}

export const DEFAULT_RANGE_GUIDE: RangeGuideValues = decode({});

let live: RangeGuideValues = DEFAULT_RANGE_GUIDE;

/** 這一場實際生效的值。渲染層每一幀讀它。 */
export function rangeGuide(): RangeGuideValues {
  return live;
}

/**
 * 套用一份 `config.range-guide@1` 文件。缺文件 / 缺欄位 = 出貨值。
 *
 * ⚠️ 缺欄位刻意**不叫**：「後台沒存過」是絕大多數玩家的正常狀態，為它叫一聲
 * 等於每一場都印一行沒有人要讀的 warn。認不得的**型別**逐格退回出貨值 ——
 * 那一層的失敗是「操作者手改 overlay 打錯字」，而後台頁與 Zod 兩層擋在前面。
 */
export function applyRangeGuideDoc(doc: unknown): void {
  const raw = doc && typeof doc === "object" ? (doc as Record<string, unknown>) : {};
  live = decode(raw);
  // ⛔ 這一行不可以少：預告通道的值住在 `vfx/telegraphChannel` 的查表裡，
  // 少了它「自己 vs 來襲」那三組欄位就是後台存得起來、地板上永遠不變。
  applyTelegraphChannelStyles(live.telegraph);
}

/** 測試用：把現值放回出貨預設（連同預告通道那一半）。 */
export function resetRangeGuide(): void {
  live = DEFAULT_RANGE_GUIDE;
  applyTelegraphChannelStyles(null);
}

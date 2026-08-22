/**
 * toggleAbility — 【開關型技能】的「開啟中」外觀，`config.toggle-ability@1` 的
 * client 端**現值**（GH#546）。
 *
 * owner 2026-08-22 逐字：
 *
 *   「**風王結界這種開關型按鈕 圖示跟特效要明顯看出是開還是關狀態**
 *     （w3x會有特殊攻擊特效跟隨手部、**圖示也會有流轉作為打開中顯示**）」
 *
 * ── 為什麼這一格不是「就緒框再亮一次」就好 ────────────────────────────────
 * ⭐ 出貨的 20-01 風王結界開著的期間，**它自己在 60 秒冷卻裡** —— 也就是說
 * `isAbilityTileReady()` 對它是 **false**。所以在這條線落地之前，一支
 * **開著的**切換技與一支**單純在冷卻**的技能在畫面上**逐位元一模一樣**：
 * 沒有框、有一圈掃描。玩家看不出「我現在開著」，而那正是 owner 抱怨的東西。
 * ⇒ 「開啟中」必須是**第三種**狀態，⛔ 不是就緒框的一個參數。
 *
 * ── 形狀逐字照抄 `ui/rangeGuideConfig.ts` ─────────────────────────────────
 *   1. 從一份 `config.toggle-ability@1` 把值讀出來（`applyToggleAbilityDoc`）
 *   2. 存成模組級現值，讓每一格磚零成本讀到（`toggleAbility()`）
 *   3. 出貨值（`SHIPPED_TOGGLE_ABILITY`）逐格等於 `content/config/toggle-ability.json`
 *
 * ⚠️ 出貨值必須存在：內容是**非同步**載入的，而首次繪製不等它
 *（`main.tsx` 的 fail-open）。「缺文件 = 出貨值」，⛔ 不是「缺文件 = 看不出開關」。
 *
 * ⛔ 少了 `ContentDb.load()` 裡那一行 `applyToggleAbilityDoc(...)`，這份 JSON
 * 就是一份沒有人讀的檔案：後台存得起來、重整還讀得回自己填的值，而場上一輩子
 * 看不到（失敗形態②）。接線點見 GH#546 報告的「需要主 session 接線」。
 */

/**
 * 「開啟中」掃光的 **CSS 動畫名**。
 *
 * ⭐ 它是一個**常數**而不是兩處各打一次字面值，理由是硬的：`@keyframes` 的名字
 * 與 `animation:` 裡引用的名字對不上時，瀏覽器**不會報錯** —— 它只是不動。
 * 而一格「不動的鑲邊」跟「關閉態」在畫面上差不多，於是這個缺陷長得像沒有缺陷
 *（失敗形態②）。共用同一顆常數 = 那個漂移在結構上不可能發生，⛔ 不需要一條測試。
 */
export const TOGGLE_ANIM_NAME = "ggd-ability-toggle";

/**
 * 掃光的 `@keyframes`。機制與 `buttonFx.css` 的 `ggd-btn-glow` 逐字相同
 *（`background-size: 300%` + 推 `background-position`）—— 那一支在這個 repo 裡
 * 已經在每一顆按鈕上跑了幾個月，⛔ 不必為這一格發明第二種流轉。
 *
 * ⚠️ **減少動態不是在這裡處理的**，是在 `abilityToggleFrameStyle()` 裡直接
 * 不發動畫（見那支的註解）。理由：這一格的「靜態版」不是「同一段動畫慢一點」，
 * 而是**整段掃光消失、只留鑲邊**，用 `@media` 覆寫 keyframes 表達不出來。
 */
const TOGGLE_KEYFRAMES = `@keyframes ${TOGGLE_ANIM_NAME}{to{background-position:300% 0}}`;

/** 注入用的 `<style>` 標記，讓 `ensureToggleKeyframes()` 認得自己上次放的那一份。 */
const STYLE_MARK = "data-ggd-toggle-keyframes";

/**
 * 把掃光的 keyframes 掛進 `document.head`（冪等；沒有 DOM 就什麼都不做）。
 *
 * ⚠️ 為什麼掛在**畫這個框的人**身上，而不是 `main.tsx` 再 import 一支 .css：
 * 「誰畫這個框誰就保證 keyframes 在」少一個會斷的環節 —— 一支忘了被 import 的
 * .css 讓動畫靜默地不跑，而那正是上面 {@link TOGGLE_ANIM_NAME} 在防的形態。
 */
export function ensureToggleKeyframes(): void {
  if (typeof document === "undefined") return;
  if (document.head.querySelector(`style[${STYLE_MARK}]`)) return;
  const el = document.createElement("style");
  el.setAttribute(STYLE_MARK, "");
  el.textContent = TOGGLE_KEYFRAMES;
  document.head.appendChild(el);
}

/** 這一場實際生效的值。 */
export interface ToggleAbilityValues {
  /** 「開啟中」的圖示流轉總開關。關掉 = 切換技的磚回到就緒框那條路。 */
  enabled: boolean;
  /** 掃光跑完一輪的毫秒數。越小越急促。 */
  sweepMs: number;
  /** 常駐鑲邊的粗細（px）—— 「它是開著的」這句話的**靜態**那一半。 */
  rimPx: number;
  /** 外暈半徑（px）。0 = 只有鑲邊沒有暈。 */
  glowPx: number;
  /** `#rrggbb`；空字串 = 用磚自己的家族色（天生技紫 / QWER 藍 / EX 金）。 */
  color: string;
}

/**
 * 出貨值 —— **逐格等於 `content/config/toggle-ability.json`**，
 * 讓漂移守衛可以直接比對兩者，⛔ 不必在測試裡抄第三份數字。
 */
export const SHIPPED_TOGGLE_ABILITY = {
  enabled: true,
  sweepMs: 2200,
  rimPx: 2,
  glowPx: 12,
  color: "",
} as const;

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

function num(candidate: unknown, fallback: number, min: number, max: number): number {
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate >= min && candidate <= max
    ? candidate
    : fallback;
}

function bool(candidate: unknown, fallback: boolean): boolean {
  return typeof candidate === "boolean" ? candidate : fallback;
}

/** `#rrggbb` 或空字串（= 家族色）；認不得的字串退回出貨值。 */
function hexOrFamily(candidate: unknown, fallback: string): string {
  if (candidate === "") return "";
  return typeof candidate === "string" && HEX6.test(candidate) ? candidate : fallback;
}

function decode(raw: Record<string, unknown>): ToggleAbilityValues {
  const S = SHIPPED_TOGGLE_ABILITY;
  return {
    enabled: bool(raw.enabled, S.enabled),
    sweepMs: num(raw.sweepMs, S.sweepMs, 200, 20000),
    rimPx: num(raw.rimPx, S.rimPx, 0, 8),
    glowPx: num(raw.glowPx, S.glowPx, 0, 40),
    color: hexOrFamily(raw.color, S.color),
  };
}

export const DEFAULT_TOGGLE_ABILITY: ToggleAbilityValues = decode({});

let live: ToggleAbilityValues = DEFAULT_TOGGLE_ABILITY;

/** 這一場實際生效的值。每一格磚每次重繪讀它。 */
export function toggleAbility(): ToggleAbilityValues {
  return live;
}

/**
 * 套用一份 `config.toggle-ability@1`。缺文件 / 缺欄位 = 出貨值。
 *
 * ⚠️ 缺欄位刻意**不叫**：「後台沒存過」是絕大多數玩家的正常狀態（同
 * `applyRangeGuideDoc`）。
 */
export function applyToggleAbilityDoc(doc: unknown): void {
  const raw = doc && typeof doc === "object" ? (doc as Record<string, unknown>) : {};
  live = decode(raw);
}

/** 測試用：把現值放回出貨預設。 */
export function resetToggleAbility(): void {
  live = DEFAULT_TOGGLE_ABILITY;
}

/** `#rrggbb` → `"R, G, B"`（`abilityReadyFrame` 的家族色三元組格式）。 */
export function toggleRgbTriplet(hex: string, family: string): string {
  if (!HEX6.test(hex)) return family;
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

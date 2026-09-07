/**
 * mobileDetect — pure predicates for touch support and for the GH#1089
 * platform policy (⛔ phones unsupported / ⭐ tablets supported, capped).
 * iOS Safari / iPadOS / WKWebView are the targets; Android is explicitly
 * out of scope. All functions take plain data so they unit-test in node;
 * `readTouchEnv()` is
 * the only DOM-touching reader, and the dev harness can force touch mode via
 * `globalThis.__ggdForceTouch = true` (browser-pane emulation without a
 * real touchscreen — same spirit as the `__ggdFakePads` seam).
 */

export interface TouchEnv {
  /** `'ontouchstart' in window` */
  hasTouchStart: boolean;
  /** `matchMedia("(pointer: coarse)").matches` */
  coarsePointer: boolean;
  /** dev harness override (`globalThis.__ggdForceTouch`) */
  forced: boolean;
  /**
   * `navigator.maxTouchPoints` (GH#1089).
   *
   * ⚠️ ⭐ **iPadOS 的 Safari 預設回報成桌機**：`'ontouchstart' in window` 是
   * **false**、UA 寫 `Macintosh`。⇒ 在此之前 `isTouchDevice()` 對 iPad 一律回
   * false ⇒ 我們「支援的那一種裝置」拿到的是**桌機的 60fps 上限**，而 owner
   * 2026-09-06 明說平板最高 30。
   * ⭐ `maxTouchPoints`（iPadOS 回 5）是那台機器上唯一還說真話的訊號。
   *
   * Optional so the dozens of existing `TouchEnv` fixtures keep compiling —
   * absent reads as 0, i.e. exactly the pre-#1089 answer.
   */
  maxTouchPoints?: number;
}

/**
 * Touch device = (touch events OR real touch points) AND a coarse primary
 * pointer — or forced.
 *
 * ⭐ GH#1089 加上了 `maxTouchPoints` 那一半，理由見 {@link TouchEnv.maxTouchPoints}：
 * ⛔ 只看 `ontouchstart` 會讓 iPadOS 整台被判成桌機。
 */
export function isTouchDevice(env: TouchEnv): boolean {
  const points = env.maxTouchPoints ?? 0;
  return env.forced || ((env.hasTouchStart || points > 0) && env.coarsePointer);
}

/** Read the live environment (safe when window/matchMedia are absent). */
export function readTouchEnv(): TouchEnv {
  const g = globalThis as { __ggdForceTouch?: boolean };
  if (typeof window === "undefined") {
    return { hasTouchStart: false, coarsePointer: false, forced: g.__ggdForceTouch === true, maxTouchPoints: 0 };
  }
  return {
    hasTouchStart: "ontouchstart" in window,
    coarsePointer:
      typeof window.matchMedia === "function"
        ? window.matchMedia("(pointer: coarse)").matches
        : false,
    forced: g.__ggdForceTouch === true,
    maxTouchPoints: typeof navigator !== "undefined" ? (navigator.maxTouchPoints ?? 0) : 0,
  };
}

// ───────────────────────────────────────── 平台政策的裝置分類 (GH#1089) ────

/**
 * 三類裝置。⭐ owner 2026-09-06 逐字：
 * > 「本遊戲不支援手機但支援平板最高 30fps  手機是 30fps
 * >  以 ipad mini 的 A17 Pro 為最低配備標準來設計」
 */
export type DeviceClass = "desktop" | "tablet" | "phone";

/** 分類要的兩個事實。`shortEdgePx` = `min(視窗寬, 視窗高)`（CSS px）。 */
export interface DeviceSizeEnv {
  touch: boolean;
  shortEdgePx: number;
}

/**
 * 這台裝置算哪一類。
 *
 * ⚠️ ⭐ **web 上分不乾淨手機與平板**，所以這裡的判準是「**短邊**有多寬」而不是
 * UA：短邊用 `min(寬,高)` 是刻意的 —— 橫拿直拿要得到同一個答案，⛔ 不可以
 * 「玩家轉了一下螢幕就從平板變成手機」。
 *
 * ⭐ **誤判的方向是選過的**：只有「觸控 **且** 短邊比門檻窄」才判手機，
 * 其餘一律 `tablet`（放行）。把平板誤判成手機＝擋住一位付錢的玩家；
 * 把手機誤判成平板＝他看不到那句告知。⇒ 後者便宜太多。
 * ⇒ 量不到尺寸（SSR / 還沒版面）時 `shortEdgePx` 是 0 ⇒ 走 `tablet`。
 */
export function classifyDevice(env: DeviceSizeEnv, phoneShortEdgePx: number): DeviceClass {
  if (!env.touch) return "desktop";
  if (phoneShortEdgePx > 0 && env.shortEdgePx > 0 && env.shortEdgePx < phoneShortEdgePx) {
    return "phone";
  }
  return "tablet";
}

/** Live read of the two facts `classifyDevice` needs. */
export function readDeviceSizeEnv(): DeviceSizeEnv {
  const touch = isTouchDevice(readTouchEnv());
  if (typeof window === "undefined") return { touch, shortEdgePx: 0 };
  return { touch, shortEdgePx: Math.min(window.innerWidth, window.innerHeight) };
}

export type Quality = "mobile" | "desktop";

/**
 * Auto quality tier: touch devices AND weak CPUs (<= 4 logical cores) get the
 * "mobile" tier — hardware scaling capped at 1.5x and halved particle budgets.
 */
export function detectQuality(opts: { touch: boolean; hardwareConcurrency: number }): Quality {
  return opts.touch || opts.hardwareConcurrency <= 4 ? "mobile" : "desktop";
}

/** Live auto-detect (navigator-safe). */
export function autoQuality(): Quality {
  const hc = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 8) : 8;
  return detectQuality({ touch: isTouchDevice(readTouchEnv()), hardwareConcurrency: hc });
}

/** The game is landscape-only on touch devices: portrait shows the overlay. */
export function shouldShowRotateOverlay(opts: {
  touch: boolean;
  width: number;
  height: number;
}): boolean {
  return opts.touch && opts.height > opts.width;
}

/**
 * Touch controls render for the single local player only — couch split-screen
 * is a TV/pad mode and keeps its pad HUD (touch joystick would be ambiguous).
 */
export function showTouchControls(opts: { touch: boolean; inGame: boolean; couch: boolean }): boolean {
  return opts.touch && opts.inGame && !opts.couch;
}

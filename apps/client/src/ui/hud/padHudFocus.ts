/**
 * padHudFocus — 「戰鬥中也要能用手把碰到 HUD」的那一顆**明確的鍵**（GH#508 / #502）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼不是「把 combat 從 COMBAT_LIVE_PHASES 拿掉」
 * ─────────────────────────────────────────────────────────────────────────────
 * `input/padFocusNav.focusNavActive` 對 `combat` / `resolution` 回 `false` 是
 * **刻意的**：那一刻手把在開英雄，方向鍵要瞄準、A 要施法。直接打開焦點層等於
 * 把玩家的方向盤交給一堆按鈕 —— 那不是修好 #508，那是換一個更大的缺陷。
 *
 * 所以這裡是**兩段式**（owner：「手把直接操作到底」）：
 *
 *   ① 戰鬥中**預設仍然直接操控英雄**（`enabled` 只是說「那顆鍵存在」，
 *      ⛔ 不是「一進戰鬥就進選單模式」）。
 *   ② 按一下 {@link PadHudFocusTuning.toggleButton}（出貨值 = Back/View）
 *      進入 **HUD 焦點模式**：焦點層接手，六個戰鬥中原本純手把碰不到的控制項
 *      （陣亡投幣 · 前往觀戰 · 記分板 · 設定/音效 · 操作說明的 ✕ · 屬性面板）
 *      全部聚焦得到。再按一次、或按 B，退回操控英雄。
 *   ③ 進入的當下畫面上要有**明顯的視覺狀態**（ui/hud/PadHudFocusBanner），
 *      否則玩家會以為手把壞了 —— 一個看不出來的模式就是失敗形態①。
 *
 * ⚠️ 模式**只在「焦點層本來會退場」的那一刻存在**：任何其他相位、或有 modal
 * 蓋在戰鬥上時，`focusNavActive` 本來就是 true，這裡一格都不要插手
 * （見 {@link padHudFocusActive} 是一個 `||`，⛔ 不是一份平行的判斷）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 第一守則 — 每一個岔路都是一格欄位（{@link PAD_HUD_FOCUS_FIELDS}）
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 接線狀態**誠實列出**（與同目錄 `StatsHoverPanel` 的 `SHIPPED_HUD_STATS`
 * 同一個形狀、同一個理由）。這條 lane **不擁有 `schema/config.ts`**，而一份
 * schema tag 不在 `zConfigDoc` union 裡的 config 文件會讓 `ContentLoader`
 * 拒絕**整包內容** → `main.tsx` fail-open 退回 2 隻骨架 → 網站看起來完全正常
 * 而沒有人能玩（2026-08-02 事故逐字重演）。⛔ 先出 JSON 再補 schema 就是埋那顆雷。
 *
 * 這裡出貨的是欄位表、上下界、會**回報自己夾了什麼**的驗證器，以及
 * {@link applyPadHudFocusOverride} 這個 runtime 接縫（形狀同 `applyGoreDoc`）。
 * 剩下的三個落點交接出去：
 *   · `packages/shared/src/content/schema/config.ts` — `config.pad-hud-focus@1`
 *     + `DEFAULT_PAD_HUD_FOCUS`（逐字鏡射 {@link SHIPPED_PAD_HUD_FOCUS}）；
 *   · `content/config/pad-hud-focus.json` + `pnpm content:build`（⛔ 全域鎖，
 *     由主 session 跑）+ **來源檔與產物一起 commit**；
 *   · `apps/admin/src/*` — `SHIPPED_*` + 欄位 union + 順序 + 標籤 + 分組
 *     + `configFromForm`；以及 `ContentDb.load()` 一行
 *     `applyPadHudFocusOverride(this.configDoc("config.pad-hud-focus@1"))`。
 */
import { focusNavActive, NAV_BACK_BTN } from "../../input/padFocusNav";

/* ═══════════════════════════════════════════════════════════════════════════
 * THE FIELDS (第一守則)
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface PadHudFocusTuning {
  /**
   * 戰鬥中那顆「切進 HUD 焦點模式」的鍵要不要存在。
   * ⚠️ `true` **不是**「一進戰鬥就進選單模式」—— 預設仍然直接操控英雄，
   * owner 要的是「手把直接操作到底」，這一格只是讓那條路存在。
   */
  enabled: boolean;
  /** 用哪一顆鍵切換（W3C Standard Gamepad 的 `buttons[]` 索引；8 = Back/View）。 */
  toggleButton: number;
  /** B 也可以退出模式（手把玩家的「返回」反射）。 */
  exitWithBack: boolean;
  /** 進入模式的當下就把焦點放到最自然的起點，⛔ 不要等玩家先撥一次方向鍵。 */
  autoFocusOnEnter: boolean;
  /** 進入模式時畫面上那條明顯的橫幅（⛔ 關掉＝模式變成隱形的）。 */
  showBanner: boolean;
}

export interface PadHudFocusFieldSpec {
  key: keyof PadHudFocusTuning;
  min?: number;
  max?: number;
  label: string;
}

/**
 * ⚠️ 每一格都有**上界**，不只有下界（第一守則）。`toggleButton` 打成 80 會讓
 * 那顆鍵永遠讀不到 `pressed`，而畫面上跟「功能沒做」一模一樣。
 */
export const PAD_HUD_FOCUS_FIELDS: readonly PadHudFocusFieldSpec[] = [
  { key: "enabled", label: "戰鬥中要不要提供「切進 HUD 焦點模式」那顆鍵（不影響直接操控英雄）" },
  {
    key: "toggleButton",
    min: 0,
    max: 19,
    label: "用哪一顆手把鍵切進／切出 HUD 焦點模式（標準對應：8=Back/View、9=Start、2=X、3=Y）",
  },
  { key: "exitWithBack", label: "B 鍵也可以退出 HUD 焦點模式" },
  { key: "autoFocusOnEnter", label: "進入模式時直接落一個起始焦點（否則要先撥一次方向鍵）" },
  { key: "showBanner", label: "進入模式時顯示畫面上那條「介面操作模式」橫幅" },
];

/**
 * THE SHIPPED VALUES.
 *
 * `enabled: true` — 衝突優先序階梯第 1 層是 owner 的話（「整個遊戲…都要可以
 * 支援手把直接操作到底」），而高層級贏的那一邊**預設 on**（第〇·六守則）。
 *
 * `toggleButton: 8`（Back/View）— `input/GamepadInput.BTN.BACK` 自 2026-07-27
 * 改鍵之後就是 DELIBERATELY UNBOUND，是戰鬥中唯一一顆按下去什麼都不會發生的
 * 面板鍵；而「View = 看介面」也正是玩家在別的遊戲裡的既有反射。
 *
 * `exitWithBack: true` — B 在焦點層本來就是「退一層」，而 HUD 焦點模式就是一層。
 * ⚠️ 只在**沒有 modal**的時候才吃：有 modal 蓋著時 B 屬於那個 modal。
 */
export const SHIPPED_PAD_HUD_FOCUS: PadHudFocusTuning = {
  enabled: true,
  toggleButton: 8,
  exitWithBack: true,
  autoFocusOnEnter: true,
  showBanner: true,
};

/** What {@link resolvePadHudFocusTuning} had to change to make a value legal. */
export interface PadHudFocusProblem {
  key: keyof PadHudFocusTuning;
  got: unknown;
  used: unknown;
  why: string;
}

/**
 * Validate a partial override against {@link PAD_HUD_FOCUS_FIELDS}.
 *
 * 它**回報**夾了什麼而不是靜默吞掉：把 8 打成 80 的操作員要被告訴「用了 19」，
 * ⛔ 不是在畫面上得到一顆按了沒反應的鍵（#279）。
 */
export function resolvePadHudFocusTuning(partial: Partial<PadHudFocusTuning> | null | undefined): {
  tuning: PadHudFocusTuning;
  problems: PadHudFocusProblem[];
} {
  const problems: PadHudFocusProblem[] = [];
  const out: PadHudFocusTuning = { ...SHIPPED_PAD_HUD_FOCUS };
  if (!partial) return { tuning: out, problems };
  const bag = partial as Record<string, unknown>;
  for (const spec of PAD_HUD_FOCUS_FIELDS) {
    const raw = bag[spec.key];
    if (raw === undefined) continue;
    const write = (v: unknown): void => {
      (out as unknown as Record<string, unknown>)[spec.key] = v;
    };
    const fallback = SHIPPED_PAD_HUD_FOCUS[spec.key];
    if (spec.min === undefined && spec.max === undefined) {
      if (typeof raw === "boolean") write(raw);
      else problems.push({ key: spec.key, got: raw, used: fallback, why: "not a boolean" });
      continue;
    }
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      problems.push({ key: spec.key, got: raw, used: fallback, why: "not a finite number" });
      continue;
    }
    const lo = spec.min ?? Number.NEGATIVE_INFINITY;
    const hi = spec.max ?? Number.POSITIVE_INFINITY;
    if (raw < lo) problems.push({ key: spec.key, got: raw, used: lo, why: `below min ${lo}` });
    else if (raw > hi) problems.push({ key: spec.key, got: raw, used: hi, why: `above max ${hi}` });
    write(Math.round(Math.min(hi, Math.max(lo, raw))));
  }
  return { tuning: out, problems };
}

/* ── the runtime seam ─────────────────────────────────────────────────────── */

let activeTuning: PadHudFocusTuning = { ...SHIPPED_PAD_HUD_FOCUS };

/** Install an operator override (or `null` to fall back to the shipped values). */
export function applyPadHudFocusOverride(
  partial: Partial<PadHudFocusTuning> | null,
): PadHudFocusProblem[] {
  const { tuning, problems } = resolvePadHudFocusTuning(partial);
  activeTuning = tuning;
  return problems;
}

/** The values the pad layer is running with right now. */
export function padHudFocusTuning(): PadHudFocusTuning {
  return activeTuning;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE PURE RULES — node-testable, no DOM, no pad.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** B's button index, re-exported so the controller reads ONE definition. */
export const PAD_HUD_FOCUS_BACK_BTN = NAV_BACK_BTN;

/**
 * ⭐ THE GATE. Should the DOM focus layer own the pad right now?
 *
 * It is `focusNavActive(...) || hudFocusMode` and nothing else: every rule about
 * screens, phases and modals stays in the ONE pure function that already owns
 * it, and this adds exactly the second stage. ⛔ Not a parallel copy of that
 * rule — a second copy is how the phase list in HudRoot went stale (#289).
 */
export function padHudFocusActive(opts: {
  screen: string;
  phase: string;
  hasScope: boolean;
  hudFocusMode: boolean;
}): boolean {
  return (
    focusNavActive({ screen: opts.screen, phase: opts.phase, hasScope: opts.hasScope }) ||
    opts.hudFocusMode
  );
}

export interface PadHudFocusFrame {
  /**
   * The focus layer would otherwise be STANDING DOWN this frame — i.e. live
   * combat with no modal open. Outside that, the mode has nothing to add and
   * must clear itself (so it can never leak into champ-select or the shop).
   */
  standingDown: boolean;
  /** the toggle button went DOWN this frame (edge, not held) */
  togglePressed: boolean;
  /** B went DOWN this frame (edge) */
  backPressed: boolean;
  /** a pad is connected at all */
  padPresent: boolean;
}

/**
 * The two-stage state machine. PURE, so 「按一下進、再按一下出、B 也出、
 * 離開戰鬥自動退」 is pinned without a browser or a physical pad.
 */
export function nextHudFocusMode(
  prev: boolean,
  f: PadHudFocusFrame,
  t: PadHudFocusTuning = padHudFocusTuning(),
): boolean {
  if (!t.enabled || !f.padPresent || !f.standingDown) return false;
  if (f.togglePressed) return !prev;
  if (prev && f.backPressed && t.exitWithBack) return false;
  return prev;
}

/* ── the tiny store the HUD paints from ───────────────────────────────────── */

let mode = false;
const listeners = new Set<() => void>();

/** Is the pad currently driving the HUD instead of the champion? */
export function padHudFocusMode(): boolean {
  return mode;
}

/** The controller (ui/PadFocusNav) publishes the mode here each frame. */
export function setPadHudFocusMode(next: boolean): void {
  if (mode === next) return;
  mode = next;
  for (const fn of listeners) fn();
}

/** `useSyncExternalStore` subscribe. */
export function subscribePadHudFocus(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

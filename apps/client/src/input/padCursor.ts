/**
 * padCursor —— 虛擬游標的**純核心**（GH#502 / K2）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * owner 要的是什麼
 * ─────────────────────────────────────────────────────────────────────────────
 * > 「我建議**類比搖桿可以代替對應滑鼠的功能**，你看有沒有類似的遊戲做過這種
 * >  對應 你可以學習參考看看」
 *
 * 業界那幾家做的是**同一件事**，而且三家都做成「⭐ 焦點導覽為主、游標為輔」：
 * Steam Big Picture / Deck 的 mouse-region（右觸控板當滑鼠，選單本身仍是焦點格）、
 * Wii U 的指標（指標是**退路**，選單照樣可以用十字鍵走）、Xbox 的無障礙選項
 * 「以搖桿移動指標」（一顆鍵切進切出，⛔ 不是常駐）。
 *
 * ⇒ 這個模組**不是**要取代 `padFocusNav`。焦點導覽走得到的東西一律讓它走
 *（一次跳一格、有 glow、A 直接按下去，比推游標快得多）；游標存在是因為
 * **有些控制項不可能全部收進焦點集合** —— 畫布上的熱區、hover 才出現的提示、
 * 第三方嵌入的東西、以及任何一個「我們還沒想到」的角落。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 兩種場合，兩個模型（⛔ 不是一套打天下）
 * ─────────────────────────────────────────────────────────────────────────────
 * | 場合 | 模型 |
 * |---|---|
 * | **選單／面板**（登入、大廳、選人、商店、三選一、結算） | 焦點導覽 **＋ 游標當退路** |
 * | **戰鬥中** | 直接操控英雄 + 軟鎖定 —— ⛔ **不是**拿游標去點地板 |
 *
 * 所以 {@link padCursorNextMode} 的第一條就是 `menuOwnsPad`：那正是
 * `padFocusNav.focusNavActive()` 的答案（螢幕 / 階段 / 有沒有 modal），
 * ⛔ 不是這裡自己再判斷一次「現在算不算戰鬥」。⭐ 一個判準一個住處：
 * 那條規則改了，游標跟著改，⛔ 不會有第二份會分岔的定義。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這個檔 vs `../ui/PadCursor`
 * ─────────────────────────────────────────────────────────────────────────────
 * 這裡是**沒有 DOM 也能跑**的那一半（設定解析、一幀走多遠、模式開關的規則）；
 * `ui/PadCursor.ts` 是瀏覽器那一半（畫出箭頭、`elementFromPoint`、派滑鼠事件）。
 * 分法與 `padFocusNav` ↔ `ui/PadFocusNav`、`padKeyboard` ↔ `ui/PadKeyboard` 一致。
 *
 * ⭐ **它自己不跑 rAF。** 每一幀由既有的 `ui/PadFocusNav` 迴圈叫進來，
 * ⛔ 不要再寫第二套 pad loop（那是第三套了）。
 */
import { Configs, DEFAULT_GAMEPAD_FEEL_POLICY, GAMEPAD_DOC_ID } from "@ggd/shared/content";

/** 螢幕座標上的一個點（`clientX`/`clientY` 的形狀）。 */
export interface CursorPoint {
  x: number;
  y: number;
}

/**
 * 手把「當滑鼠用」的那幾格設定。
 *
 * ⚠️ **`deadzone` 刻意不是新欄位** —— 它就是 `config.gamepad@1.deadzone`，
 * 那一格今天已經在後台調得到。死區描述的是**這支搖桿的漂移量**（硬體性質），
 * ⛔ 不是「在選單裡」與「在戰鬥中」兩種不同的偏好；替游標再開一格
 * `cursorDeadzone` 就是同一個數字的第二個住處（第〇·四守則），而兩份一定會分岔。
 */
export interface PadCursorTuning {
  /** 虛擬游標這條退路要不要存在。⛔ 關掉＝那顆切換鍵按下去什麼都不會發生。 */
  cursorEnabled: boolean;
  /** 小鍵盤要不要在 A 停在文字欄位上時浮出來（GH#503 的那條路）。 */
  keyboardEnabled: boolean;
  /** 搖桿推到底時游標的速度（**每秒像素**）。 */
  cursorSpeed: number;
  /** 加速曲線的指數：1 = 線性，越大代表**輕推越慢、推到底一樣快**。 */
  cursorAccel: number;
  /** 切進／切出游標模式的那顆鍵（W3C Standard Gamepad 的 `buttons[]` 索引）。 */
  cursorToggleButton: number;
  /** 搖桿要推過這個徑向長度才算有推（＝`config.gamepad@1.deadzone`）。 */
  deadzone: number;
}

interface FieldSpec {
  key: keyof PadCursorTuning;
  min?: number;
  max?: number;
  /** 只吃整數的欄位（按鍵索引）。⛔ 曲線指數與速度不可以被四捨五入掉。 */
  int?: boolean;
  label: string;
}

/**
 * ⚠️ 每一格都有**上界**，不只有下界（第一守則）。
 * `cursorSpeed` 打成 11000 會讓游標一撥就飛到螢幕另一邊 —— 而畫面上跟
 * 「游標壞了」一模一樣；`cursorToggleButton` 打成 80 會讓那顆鍵永遠讀不到
 * `pressed`，而那跟「功能沒做」一模一樣（同 `ui/hud/padHudFocus` 的那一格）。
 */
export const PAD_CURSOR_FIELDS: readonly FieldSpec[] = [
  { key: "cursorEnabled", label: "選單裡要不要提供「以左搖桿移動虛擬游標」這條退路（戰鬥中一律停用）" },
  { key: "keyboardEnabled", label: "焦點停在文字欄位上按 A 時要不要浮出螢幕小鍵盤" },
  { key: "cursorSpeed", min: 100, max: 4000, label: "搖桿推到底時虛擬游標的速度（每秒像素）" },
  {
    key: "cursorAccel",
    min: 1,
    max: 4,
    label: "虛擬游標的加速曲線指數（1=線性；越大代表輕推越慢、推到底一樣快，好瞄準小按鈕）",
  },
  {
    key: "cursorToggleButton",
    min: 0,
    max: 19,
    int: true,
    label: "用哪一顆手把鍵切進／切出虛擬游標（標準對應：10=左搖桿按下 L3、11=R3、2=X）",
  },
  { key: "deadzone", min: 0.01, max: 0.6, label: "搖桿死區（與戰鬥共用同一格，見 config.gamepad@1）" },
];

/**
 * THE SHIPPED VALUES.
 *
 * `cursorEnabled` / `keyboardEnabled: true` —— 衝突優先序階梯第 1 層是 owner 的話
 *（「整個遊戲…都要可以支援手把直接操作到底」），而高層級贏的那一邊**預設 on**
 *（第〇·六守則：開關存在是為了回頭，⛔ 不是為了觀望）。
 *
 * `cursorToggleButton: 10`（L3，左搖桿按下）—— 選單場合裡它是**空的**：
 * `ui/PadFocusNav` 只讀 0/1/8/9/12–15 與軸 0–3，而 `input/GamepadInput` 的
 * L3（鏡頭跟隨）只在戰鬥中活著，那時游標本來就停用。⭐ 選一顆已經被占用的鍵
 * 會讓「切游標」與「切鏡頭」在某個邊界重疊，而重疊的鍵是查不出來的鬼故事。
 *
 * `cursorSpeed: 1100` —— 1080p 的畫面撥到底約 1.7 秒橫跨全螢幕，
 * 與 Xbox 無障礙指標的出貨手感同一個量級。
 * `cursorAccel: 1.8` —— 純線性（1）在小按鈕上會抖，指數讓輕推變成慢慢挪。
 *
 * ⚠️ `deadzone` **不重打一份**：它從 `DEFAULT_GAMEPAD_FEEL_POLICY` 推導。
 * 手打一個 0.15 就是第四個住處，而第四個住處一定會過期（第〇·四守則）。
 */
export const SHIPPED_PAD_CURSOR: PadCursorTuning = {
  cursorEnabled: true,
  keyboardEnabled: true,
  cursorSpeed: 1100,
  cursorAccel: 1.8,
  cursorToggleButton: 10,
  deadzone: DEFAULT_GAMEPAD_FEEL_POLICY.deadzone,
};

/** 解析時被夾掉的一格（⛔ 不靜默吞：操作員要知道他打的 11000 變成了 4000）。 */
export interface PadCursorProblem {
  key: keyof PadCursorTuning;
  got: unknown;
  used: unknown;
  why: string;
}

/**
 * 設定文件（或後台 override）→ 生效中的手感。缺席／型別錯／超界一律夾回出貨值
 * 並**回報**，⛔ 不是靜默吞掉（#279 那條路：按了沒反應而畫面上什麼都沒說）。
 */
export function resolvePadCursorTuning(partial: unknown): {
  tuning: PadCursorTuning;
  problems: PadCursorProblem[];
} {
  const problems: PadCursorProblem[] = [];
  const out: PadCursorTuning = { ...SHIPPED_PAD_CURSOR };
  if (!partial || typeof partial !== "object") return { tuning: out, problems };
  const bag = partial as Record<string, unknown>;
  for (const spec of PAD_CURSOR_FIELDS) {
    const raw = bag[spec.key];
    if (raw === undefined) continue;
    const fallback = SHIPPED_PAD_CURSOR[spec.key];
    const write = (v: unknown): void => {
      (out as unknown as Record<string, unknown>)[spec.key] = v;
    };
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
    const clamped = Math.min(hi, Math.max(lo, raw));
    write(spec.int === true ? Math.round(clamped) : clamped);
  }
  return { tuning: out, problems };
}

/**
 * 生效中的設定 —— `content/config/gamepad.json` ?? 出貨值。
 *
 * ⭐ 和 `GamepadInput.activeGamepadFeel()`、`CameraRig` 讀 `config.camera@1`
 * 是**同一條路**：每次呼叫都重讀，所以後台存檔之後玩家重整一次分頁就生效，
 * ⛔ 不必重建 client 映像（第一守則）。
 *
 * ⚠️ 今天 `config.gamepad@1` 的 Zod 只有 `deadzone` 那一格是這裡認得的
 * （另外五個鍵還沒進 schema，見 GH#502 報告的「需要主 session 接線」）。
 * ⭐ 這個函式**不必為此改一行**：那五個鍵一落進 JSON 就會被讀到，
 * 因為解析走的是欄位表而不是一份手抄的鍵名清單。
 */
export function padCursorTuning(): PadCursorTuning {
  return resolvePadCursorTuning(Configs.tryGet(GAMEPAD_DOC_ID)).tuning;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE PURE RULES —— node-testable，沒有 DOM、沒有手把
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ 一幀最多算這麼多毫秒。分頁切回前景時 `performance.now()` 的差值會是好幾秒，
 * 而 `速度 × 那個差值` 會讓游標瞬間貼到螢幕角落 —— 玩家看到的是「我的游標不見了」。
 */
export const PAD_CURSOR_MAX_FRAME_MS = 64;

/**
 * ⭐ **THE GATE** —— 這一幀游標模式該是開還是關。
 *
 * 三條，順序有意義：
 *  ① 設定關掉 → 一律關（那顆切換鍵按下去什麼都不會發生，這是刻意的）
 *  ② ⭐ **選單沒有拿著手把 → 一律關**。這就是「戰鬥中自動停用」那一條：
 *     `menuOwnsPad` 由 `padFocusNav.focusNavActive()` 給，⛔ 這裡不重判一次。
 *     它同時涵蓋「打到一半跳出 modal」（那時 menu 拿回手把，游標可以用）。
 *  ③ 剩下的才輪到玩家：切換鍵翻面，B 只退出（⛔ 不會用 B 打開它 ——
 *     B 在焦點層是「退一層」，用它進入一個模式會讓每一次返回都變成驚喜）。
 */
export function padCursorNextMode(
  prev: boolean,
  opts: {
    enabled: boolean;
    menuOwnsPad: boolean;
    togglePressed: boolean;
    backPressed: boolean;
  },
): boolean {
  if (!opts.enabled) return false;
  if (!opts.menuOwnsPad) return false;
  if (opts.togglePressed) return !prev;
  if (opts.backPressed && prev) return false;
  return prev;
}

/** 游標剛開啟時放哪：螢幕正中央（⛔ 不是 0,0 —— 那在角落，看起來像沒開）。 */
export function padCursorHome(viewport: { w: number; h: number }): CursorPoint {
  return { x: viewport.w / 2, y: viewport.h / 2 };
}

/**
 * 一幀之後游標在哪。⛔ 純函式：不碰 DOM、不讀時鐘。
 *
 * 死區之外**重新正規化到 0..1**（`(mag - dz) / (1 - dz)`），⛔ 不是直接用
 * `mag` —— 後者會讓搖桿一離開死區就以 `deadzone × speed` 的速度**跳**出去，
 * 而那正是「微調瞄準做不到」的手感。
 */
export function stepPadCursor(
  pos: CursorPoint,
  axes: { x: number; y: number },
  dtMs: number,
  t: PadCursorTuning,
  viewport: { w: number; h: number },
): CursorPoint {
  const mag = Math.hypot(axes.x, axes.y);
  if (!(mag > t.deadzone)) return pos;
  const dt = Math.min(PAD_CURSOR_MAX_FRAME_MS, Math.max(0, dtMs)) / 1000;
  const unit = Math.min(1, (mag - t.deadzone) / (1 - t.deadzone));
  const travel = t.cursorSpeed * Math.pow(unit, t.cursorAccel) * dt;
  return {
    x: Math.min(viewport.w - 1, Math.max(0, pos.x + (axes.x / mag) * travel)),
    y: Math.min(viewport.h - 1, Math.max(0, pos.y + (axes.y / mag) * travel)),
  };
}

/**
 * feelFx —— GH#494「爽度」那一層的**純函式**半邊：政策讀取 + 軌跡數學 + 音階梯。
 *
 * owner 2026-08-21 逐字：
 *   「殭屍死掉後**掉落小金幣**停留 **1秒**後**動畫效果軌跡(貝茲曲線加速)吸回到
 *     擊殺的英雄**搭配**輕音效** **提高爽度 模仿肉鴿遊戲的氛圍感**」
 *   「**連擊也會有像 candy crush 類似連段音階升高的音效**」
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ⭐ 這個檔案裡沒有一行會改變任何人拿到的金幣
 * ───────────────────────────────────────────────────────────────────────────
 * 擊殺賞金在 `sim/systems/MobSystem.ts` 早就發完了（`grantGold` / `payMobBounty`），
 * 而且是在**伺服器**上。這一層拿到的 `mobSlain` 事件是那件事**已經發生**的公告。
 * 所以：`gold` 這個欄位在整條路徑上**沒有被讀**，⛔ 也不可以被讀 ——
 * 一旦金幣的**顆數**或**軌跡**開始跟金額有關，這一層就從「畫面」變成「經濟的
 * 第二個描述」，而兩個描述遲早會打架。`feelFx.test.ts` 把這一條釘成行為斷言：
 * 兩個只有 `gold` 不同的事件必須產生**逐格相同**的飛行狀態。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 為什麼連擊計數**不**放在這裡（parent 問的）
 * ───────────────────────────────────────────────────────────────────────────
 * 因為它**今天就已經在 sim 裡**了：`packages/shared/src/sim/combat/killCombo.ts`
 * 的 `creditKillCombo` 在 MobSystem/DeathSystem 的擊殺點記帳，用 `world.tick`
 * 量 5 秒視窗，並發出 `killCombo` 事件（`{killer, killerSeatId, count, windowMs}`）。
 * ⛔ 在客戶端再數一次就是第二份會 drift 的知識 —— 而且會數錯：同一 tick 內的
 * AoE 連殺在網路上是一批事件，用到達時間去分辨「一次橫掃」和「兩次擊殺」是猜的。
 *
 * ⇒ **sim 給數字，客戶端只把數字翻譯成音高。** 音階梯（升幾階、到頂在哪、多久
 * 歸零）純粹是聽覺，不影響任何一場比賽的結果，所以它住在這裡。
 */
import { Configs, DEFAULT_FEEL_FX, type ConfigFeelFxDoc } from "@ggd/shared/content";

export { DEFAULT_FEEL_FX };
export type { ConfigFeelFxDoc };

/** 一個平面座標 —— 這一層只認得 x/z，高度是它自己算出來的弧。 */
export interface Vec2 {
  x: number;
  z: number;
}

/** 一個 3D 取樣點（弧的高度是 `y`）。 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function num(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * 把任意輸入解讀成一份政策。**逐格**降級，⛔ 不是整份二選一 —— 一份被截斷的
 * override（後台存了一半、或一個舊版本的 override 缺了新欄位）會有正確的
 * `schema` 而少幾格，那時候整份丟掉會連 owner 存過的那幾格一起丟掉，
 * 而逐格丟掉只會丟掉真的壞掉的那一格。
 *
 * ⚠️ 每一格都在這裡就夾回 schema 的上下界：`Configs.tryGet` 走的是**寬鬆**路徑
 * （沒有跑 Zod），所以一個界外的數字有可能走到這裡。夾在這裡而不是在消費端，
 * 是因為消費端有三個（軌跡 / 音效 / 施法粒子）。
 */
export function readFeelFx(doc: unknown): ConfigFeelFxDoc {
  const d = doc as Partial<ConfigFeelFxDoc> | null | undefined;
  if (!d || typeof d !== "object" || d.schema !== "config.feel-fx@1") return DEFAULT_FEEL_FX;
  const g = (d.goldPickup ?? {}) as Partial<ConfigFeelFxDoc["goldPickup"]>;
  const c = (d.comboPitch ?? {}) as Partial<ConfigFeelFxDoc["comboPitch"]>;
  const m = (d.castMotes ?? {}) as Partial<ConfigFeelFxDoc["castMotes"]>;
  const D = DEFAULT_FEEL_FX;
  return {
    id: D.id,
    schema: "config.feel-fx@1",
    goldPickup: {
      enabled: bool(g.enabled, D.goldPickup.enabled),
      hoverSeconds: num(g.hoverSeconds, 0, 5, D.goldPickup.hoverSeconds),
      flightSeconds: num(g.flightSeconds, 0.05, 3, D.goldPickup.flightSeconds),
      easePower: num(g.easePower, 1, 6, D.goldPickup.easePower),
      arcHeight: num(g.arcHeight, 0, 8, D.goldPickup.arcHeight),
      maxConcurrent: Math.round(num(g.maxConcurrent, 1, 256, D.goldPickup.maxConcurrent)),
      sfxThrottleMs: Math.round(num(g.sfxThrottleMs, 0, 2000, D.goldPickup.sfxThrottleMs)),
      sfxVolume: num(g.sfxVolume, 0, 2, D.goldPickup.sfxVolume),
    },
    comboPitch: {
      enabled: bool(c.enabled, D.comboPitch.enabled),
      semitonesPerStep: num(c.semitonesPerStep, 0, 4, D.comboPitch.semitonesPerStep),
      maxSteps: Math.round(num(c.maxSteps, 0, 24, D.comboPitch.maxSteps)),
      resetAfterSeconds: num(c.resetAfterSeconds, 0.5, 30, D.comboPitch.resetAfterSeconds),
    },
    castMotes: {
      lifetimeMinSec: num(m.lifetimeMinSec, 0.05, 3, D.castMotes.lifetimeMinSec),
      lifetimeMaxSec: num(m.lifetimeMaxSec, 0.05, 3, D.castMotes.lifetimeMaxSec),
      gravityY: num(m.gravityY, 0, 20, D.castMotes.gravityY),
      drag: num(m.drag, 0.1, 1, D.castMotes.drag),
    },
  };
}

/**
 * 現在生效的政策。`read` 是測試 / audition 頁的接縫；出貨路徑走
 * `Configs.tryGet("feel-fx")`，也就是後台存檔之後**玩家下一次重新整理**就生效
 * （客戶端開機時載入內容覆蓋層）。
 */
export function feelFx(read: () => unknown = () => Configs.tryGet("feel-fx")): ConfigFeelFxDoc {
  return readFeelFx(read());
}

// ───────────────────────────────────────────────────────── 貝茲曲線 ─────────

/**
 * 「加速」那一半。owner ⛔ 明說不要等速直線，所以參數 t 先被拉成 `t^power`：
 * 起步慢慢飄、末段暴衝進身體 —— 磁鐵的感覺。`power === 1` 就是等速（那是止血閥，
 * ⛔ 不是出貨值）。
 */
export function easeAccelerate(t: number, power: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return clamped ** Math.max(1, power);
}

/**
 * 二次貝茲的**控制點**：起點與終點的中點，再往上抬 `arcHeight`。
 *
 * 為什麼是往「上」而不是往側邊：這台相機是 68° 俯角固定 yaw（見 `audio/spatial`），
 * 側偏在螢幕上幾乎看不出來，抬高才讀得到弧。`arcHeight === 0` 退化成直線 ——
 * 那是止血閥，⛔ 不是出貨值。
 */
export function flightControlPoint(from: Vec2, to: Vec2, arcHeight: number, baseY: number): Vec3 {
  return {
    x: (from.x + to.x) / 2,
    y: baseY + Math.max(0, arcHeight),
    z: (from.z + to.z) / 2,
  };
}

/**
 * 二次貝茲在 `t`（**已經**過緩動）的取樣點。起點與終點都貼在 `baseY`，中間鼓起來。
 *
 * ⚠️ 呼叫端傳進來的 `t` 必須是 `easeAccelerate` 的輸出，⛔ 不是原始的時間比例 ——
 * 把緩動寫進這支函式會讓「彎多少」和「多快」再也分不開，而 owner 分別點名了它們。
 */
export function bezierAt(from: Vec2, ctrl: Vec3, to: Vec2, baseY: number, t: number): Vec3 {
  const u = 1 - t;
  const a = u * u;
  const b = 2 * u * t;
  const c = t * t;
  return {
    x: a * from.x + b * ctrl.x + c * to.x,
    y: a * baseY + b * ctrl.y + c * baseY,
    z: a * from.z + b * ctrl.z + c * to.z,
  };
}

// ─────────────────────────────────────────────────────── 連段音階 ───────────

/**
 * 連擊數 → 升幾個半音。**有上限**（owner：candy crush 那種爬升，⛔ 到頂不刺耳）。
 *
 * `count` 是 sim 給的連殺鏈長度（1 = 這是鏈上的第一刀）。第一刀是**基準音**，
 * 所以升的階數是 `count - 1`，再夾在 `maxSteps` 以內。
 */
export function comboSemitones(count: number, cfg: ConfigFeelFxDoc["comboPitch"]): number {
  if (!cfg.enabled) return 0;
  const steps = Math.min(Math.max(0, Math.floor(count) - 1), cfg.maxSteps);
  return steps * cfg.semitonesPerStep;
}

/**
 * 半音 → `AudioBufferSourceNode.playbackRate`。等律：一個八度 = 12 半音 = ×2。
 *
 * ⭐ 這就是「⛔ 不要準備 12 個音檔」的那一行（第零守則⑨）：**一個** clip 加一個
 * 倍率就是整條音階，⛔ 不是十二份會各自腐爛的資產。
 */
export function semitonesToPlaybackRate(semitones: number): number {
  return 2 ** (semitones / 12);
}

// ─────────────────────────────────────────────────────── 音效節流 ───────────

/**
 * 這一發吸取音效**現在**放不放得出來。
 *
 * ⛔ 被擋掉的那一發是**不播**，不是排隊等一下再播 —— 排隊只會把噪音往後挪，
 * 而 owner 要的是「輕」。`throttleMs === 0` = 不節流（止血閥／安靜的場合）。
 */
export function sfxAllowed(nowMs: number, lastMs: number, throttleMs: number): boolean {
  return throttleMs <= 0 || nowMs - lastMs >= throttleMs;
}

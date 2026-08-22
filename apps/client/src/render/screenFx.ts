/**
 * screenFx —— `screenFlash` / `screenShake` 的**純**數學（⛔ 沒有 DOM、沒有 Babylon）。
 *
 * owner 2026-08-22:「畫面閃爍及震動 不然都不知道發生什麼事情」。
 *
 * ⚠️ 這條需求的重點是**資訊**,不是華麗:一個大招在畫面外命中、一個爆擊落在腳下,
 * 目前兩者在螢幕上是同一件事(什麼都沒有)。所以這一層要做的是「有事發生」的
 * **全域**通道 —— 而正因為它是全域的,它同時是這個 repo 裡**最容易變成傷害**的一層:
 *   · 全螢幕高頻閃爍是光敏性癲癇的直接誘因;
 *   · 相機位移是動暈症的直接誘因。
 *
 * ⇒ 兩件事在這裡是**硬**的,⛔ 不是選項:
 *   ① `prefers-reduced-motion` 一律吃(震動歸零、閃爍大幅衰減);
 *   ② 每一格都有**後台上界**(第一守則),而且上界夾在**這裡**,⛔ 不是在技能 JSON 裡 ——
 *      一支寫了 `peakAlpha: 1` 的技能不可以把畫面打成全白。
 *
 * ⚠️ 上界與下界都要有(第一守則的那一句):`validateField` 只檢查 `min` 的那個年代,
 * 50 打成 500 會過後台、在下游被靜默夾掉。這裡的 `clamp01`/`clampTo` 是**夾**,
 * 而 Zod 那一格要**拒**。兩層都要。
 *
 * ── ⭐ GH#549 收尾:上界**從內容來**,⛔ 不是編譯進映像的常數 ──────────────────
 * `DEFAULT_SCREEN_FX_LIMITS` 在此之前是這一層唯一的真相,而 `config.screen-fx@1`
 * (出貨值 + 無障礙那三格)是**零 production 消費端**的 —— 操作者存得起來、
 * 重整讀得回來、遊戲一輩子看不到(第一·五守則的形狀:每一個零件都對,只有組合是空的)。
 * {@link screenCuePolicyFromContent} 是那條缺的邊:`Configs` → 政策 → 這一層的上界。
 * ⚠️ 它在**載入時**解析一次(第〇·四守則),⛔ 不是每一發特效都去查一次登錄表。
 */
import {
  Configs,
  SCREEN_FX_DOC_ID,
  resolveScreenFx,
  screenFxReducedMultipliers,
  zConfigScreenFxDoc,
  type ScreenFxPolicy,
} from "@ggd/shared/content";

/** 誰看得到這一發 —— 逐字照 L1／L2 共同約定的介面。 */
export type ScreenFxAudience = "self" | "victim" | "all";

export interface ScreenFlashSpec {
  colorRgb: [number, number, number];
  peakAlpha: number;
  durationSec: number;
  applyTo?: ScreenFxAudience;
}

export interface ScreenShakeSpec {
  amplitude: number;
  durationSec: number;
  applyTo?: ScreenFxAudience;
}

/**
 * 後台可調的上界（第一守則）。
 *
 * ⚠️ 這裡的值是 **`DEFAULT_*`（三個住處之一）**,⛔ 不是第四個住處 ——
 * 出貨值住 `content/config/screen-fx.json`,Zod 那一格拒絕越界,這裡是載入前的預設。
 * 守衛⛔ 不可以抄這些數字(第二守則:驗機制不驗數字)。
 */
export interface ScreenFxLimits {
  /** 全螢幕閃爍的最大不透明度 */
  flashMaxAlpha: number;
  /** 一次閃爍最長幾秒 */
  flashMaxSec: number;
  /** 相機震動的最大振幅（世界單位） */
  shakeMaxAmplitude: number;
  /** 一次震動最長幾秒 */
  shakeMaxSec: number;
  /** `prefers-reduced-motion` 下閃爍還剩多少（0 = 全關） */
  reducedFlashMult: number;
  /** `prefers-reduced-motion` 下震動還剩多少（0 = 全關） */
  reducedShakeMult: number;
}

export const DEFAULT_SCREEN_FX_LIMITS: ScreenFxLimits = {
  flashMaxAlpha: 0.55,
  flashMaxSec: 0.6,
  shakeMaxAmplitude: 0.45,
  shakeMaxSec: 0.9,
  // ⭐ ⛔ 不是 0 —— owner 要的是「知道發生什麼事情」。reduced-motion 的人也需要那個
  //    資訊,所以留一個**不閃**的淡色壓底(見 screenFlashAlpha 的 reduced 分支)。
  reducedFlashMult: 0.3,
  // ⭐ 這一格是 0,與 `combatFeedback.cameraShakeScaleFor(q, reduced) → 0` 同一個立場:
  //    相機位移沒有「弱一點的版本」,它要嘛動要嘛不動。
  reducedShakeMult: 0,
};

function clampTo(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/** 這一發輪不輪得到這個觀眾看。`applyTo` 省略 = `all`。 */
export function screenFxAudienceAllows(
  applyTo: ScreenFxAudience | undefined,
  viewer: { isCaster: boolean; isVictim: boolean },
): boolean {
  switch (applyTo ?? "all") {
    case "self":
      return viewer.isCaster;
    case "victim":
      return viewer.isVictim;
    default:
      return true;
  }
}

/** 夾過上界、吃過 reduced-motion 之後真的要畫的閃爍。null = 不畫。 */
export interface ResolvedScreenFlash {
  /** CSS 的 `rgb(r,g,b)` —— overlay 只需要顏色，alpha 走 envelope */
  colorCss: string;
  peakAlpha: number;
  durationMs: number;
  /** reduced-motion 下改成「淡入淡出的一層底」而不是一記閃 */
  gentle: boolean;
}

export function resolveScreenFlash(
  spec: ScreenFlashSpec,
  limits: ScreenFxLimits,
  reducedMotion: boolean,
): ResolvedScreenFlash | null {
  const mult = reducedMotion ? clampTo(limits.reducedFlashMult, 0, 1) : 1;
  const peak = clampTo(spec.peakAlpha, 0, limits.flashMaxAlpha) * mult;
  if (!(peak > 0)) return null;
  const sec = clampTo(spec.durationSec, 0, limits.flashMaxSec);
  if (!(sec > 0)) return null;
  const [r, g, b] = spec.colorRgb;
  const ch = (v: number): number => Math.round(clampTo(v, 0, 255));
  return {
    colorCss: `rgb(${ch(r)},${ch(g)},${ch(b)})`,
    peakAlpha: peak,
    // ⭐ reduced-motion 下把同一份「有事發生」拉長成一次緩慢的呼吸,
    //    亮度低、沒有陡峭的上升緣 —— 資訊在,誘因不在。
    durationMs: (reducedMotion ? sec * 1.6 : sec) * 1000,
    gentle: reducedMotion,
  };
}

export interface ResolvedScreenShake {
  amplitude: number;
  durationMs: number;
}

export function resolveScreenShake(
  spec: ScreenShakeSpec,
  limits: ScreenFxLimits,
  reducedMotion: boolean,
): ResolvedScreenShake | null {
  const mult = reducedMotion ? clampTo(limits.reducedShakeMult, 0, 1) : 1;
  const amp = clampTo(spec.amplitude, 0, limits.shakeMaxAmplitude) * mult;
  if (!(amp > 0)) return null;
  const sec = clampTo(spec.durationSec, 0, limits.shakeMaxSec);
  if (!(sec > 0)) return null;
  return { amplitude: amp, durationMs: sec * 1000 };
}

/** 上升緣佔整段壽命的比例（一記閃要「立刻」到頂，⛔ 不是慢慢亮起來）。 */
const ATTACK_FRAC = 0.12;
/** reduced-motion 的緩和版：上升緣拉到 40%，沒有陡峭邊緣。 */
const GENTLE_ATTACK_FRAC = 0.4;

/**
 * `t01`（0…1 的壽命進度）時的不透明度。
 *
 * 形狀是**快上慢下**的三角:一記閃的資訊全在上升緣,而慢慢亮起來的那一版
 * 讀起來像「畫面壞了」而不是「有東西打中我」。
 */
export function screenFlashAlpha(t01: number, peakAlpha: number, gentle = false): number {
  if (!(peakAlpha > 0)) return 0;
  const t = clampTo(t01, 0, 1);
  const attack = gentle ? GENTLE_ATTACK_FRAC : ATTACK_FRAC;
  if (t <= attack) return peakAlpha * (t / attack);
  return peakAlpha * (1 - (t - attack) / (1 - attack));
}

// ═══════════════════════════════════════════════════════════════════════════
//  ⭐ GH#549 —— `config.screen-fx@1` → 這一層（＝那份文件唯一的去向）
// ═══════════════════════════════════════════════════════════════════════════

/** 「有事發生」那一層的全部後台上界 —— 閃爍/震動 ＋ 特效文字的兩格。 */
export interface ScreenCuePolicy {
  limits: ScreenFxLimits;
  /** 所有 `floatingText` 的字級再乘這個數字（技能寫的 `sizeScale` 是相對值） */
  floatingTextScale: number;
  /** 同時最多幾段特效文字（＝池子大小，⛔ 不是「多的丟掉」的軟門檻） */
  floatingTextMaxOnScreen: number;
}

/**
 * 政策 → 這一層真的在夾的那六格。
 *
 * ⭐ **總開關只有一個出口**：`enabled: false` 在這裡把兩條**非** reduced-motion
 * 的路也歸零 —— `screenFxReducedMultipliers` 只管得到 reduced-motion 那一半，
 * 少了這兩行，關掉總開關的操作者會發現「沒開減少動態的人照樣被閃」。
 */
export function screenFxLimitsFrom(policy: ScreenFxPolicy): ScreenFxLimits {
  const m = screenFxReducedMultipliers(policy);
  return {
    flashMaxAlpha: policy.enabled ? policy.flashMaxAlpha : 0,
    flashMaxSec: policy.flashMaxSec,
    shakeMaxAmplitude: policy.enabled ? policy.shakeMaxAmplitude : 0,
    shakeMaxSec: policy.shakeMaxSec,
    reducedFlashMult: m.flash,
    reducedShakeMult: m.shake,
  };
}

/**
 * 從**出貨的**內容登錄表解析一次。
 *
 * ⚠️ `safeParse` 而不是逐格降級：`resolveScreenFx` 的檔頭已經把「缺席／壞掉一律
 * 回退到出貨預設」定成這一份的契約，這裡再寫一套逐格夾就是**第二個住處**
 * （而兩份降級規則分岔的那一天兩份看起來都對）。
 *
 * ⚠️ 內容載不到那條路回的是出貨預設，⛔ 不是 0 —— 在 2026-08-01 骨架事故那條路上
 * 把上界變成 0，會讓「內容全毀」看起來像「這一版把畫面回饋拿掉了」。
 */
export function screenCuePolicyFromContent(
  read: () => unknown = () => Configs.tryGet(SCREEN_FX_DOC_ID),
): ScreenCuePolicy {
  const parsed = zConfigScreenFxDoc.safeParse(read());
  const policy = resolveScreenFx(parsed.success ? parsed.data : null);
  return {
    limits: screenFxLimitsFrom(policy),
    floatingTextScale: policy.floatingTextScale,
    floatingTextMaxOnScreen: policy.floatingTextMaxOnScreen,
  };
}

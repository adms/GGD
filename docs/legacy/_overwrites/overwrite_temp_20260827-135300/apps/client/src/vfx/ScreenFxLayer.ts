/**
 * ScreenFxLayer —— `screenFlash` + `screenShake` 的**執行**那一半。
 *
 * owner 2026-08-22:「畫面閃爍及震動 不然都不知道發生什麼事情」。
 *
 * ── 為什麼閃爍是一個 DOM overlay,⛔ 不是一個 PostProcess ─────────────────────
 * 這個 repo 已經有一個螢幕空間的 pass(`vfx/CombatPostFx` 的紅色邊緣暈影),而它的
 * 檔頭記著一條很貴的教訓:那個 pass 曾經多帶一條「漣漪」通道,結果 UV 扭曲在
 * 68° 俯角下只有地板有高頻細節 ⇒ 玩家看到的是**地板在震**,不是畫面在震
 * (owner 原話:「為什麼開始戰鬥 地板總是會有莫名的震動波紋曲線」)。
 *
 * ⭐ 全螢幕純色閃爍**沒有**這個問題,而且它:
 *   · 不吃 GPU(一個 composited 的 div,⛔ 不是一次全螢幕取樣);
 *   · 在 mobile/low 品質層照樣在(post-process 在那一層是關掉的,而
 *     「不知道發生什麼事情」在低階機上更嚴重);
 *   · 逐格可測(vitest 讀 `style.opacity`,⛔ 不需要 GPU)。
 *
 * ── ⛔ 一個 flash 一個 div 是不行的 ──────────────────────────────────────────
 * 克勞德一次七刀,每刀一發 → 一秒鐘七次 `createElement` + 七次 layout。
 * 這裡是**一個**固定的 div,多發閃爍在數學上合成之後**寫一次** style。
 * 同一個理由,`FloatingTextFx` 用固定池。
 *
 * ── 震動走既有的 CameraRig,⛔ 不另開一條 ────────────────────────────────────
 * `CameraRig.addShake(amp, durationMs, opts)` 已經有:預配置的 impulse 池、
 * 最弱者被搶佔、`shakeDecayEnvelope` 的三次方收尾、以及與品質層/reduced-motion
 * 相乘的 `shakeScale`。再寫一條相機位移 = 兩份會互相打架的相機真相。
 */
import { prefersReducedMotion } from "../ui/buttonSfx";
import {
  DEFAULT_SCREEN_FX_LIMITS,
  exDimAlpha,
  exDimFilter,
  exDimTuning,
  resolveScreenFlash,
  resolveScreenShake,
  screenFlashAlpha,
  screenFxAudienceAllows,
  type ScreenFlashSpec,
  type ScreenFxLimits,
  type ScreenShakeSpec,
} from "../render/screenFx";

/** 同時最多幾發閃爍參與合成（超過的搶佔最弱的一發）。 */
const MAX_FLASHES = 4;

interface FlashSlot {
  active: boolean;
  r: number;
  g: number;
  b: number;
  peak: number;
  gentle: boolean;
  ageMs: number;
  lifeMs: number;
}

export interface ScreenFxLayerOptions {
  /** overlay 掛在哪（預設 document.body）；沒有 DOM 時整層自動停用 */
  host?: HTMLElement | null;
  /** 相機震動的出口 —— 出貨接 `CameraRig.addShake` */
  addShake?: (amplitude: number, durationMs: number) => void;
  /** 後台上界（第一守則）。省略 = `DEFAULT_SCREEN_FX_LIMITS` */
  limits?: ScreenFxLimits;
  /** 測試 seam：⛔ 不要在出貨路徑覆寫它 */
  reducedMotion?: boolean;
}

export class ScreenFxLayer {
  private shakeSink: ((amplitude: number, durationMs: number) => void) | undefined;
  private readonly slots: FlashSlot[] = Array.from({ length: MAX_FLASHES }, () => ({
    active: false,
    r: 0,
    g: 0,
    b: 0,
    peak: 0,
    gentle: false,
    ageMs: 0,
    lifeMs: 0,
  }));

  private el: HTMLDivElement | null = null;
  private limits: ScreenFxLimits;
  private readonly reduced: boolean;
  private lastAlpha = -1;
  private lastColor = "";
  private disposed = false;

  // ── EX backdrop（GH#741 / 舊 #42）—— ⭐ 刻意**不**共用上面那四格 slot ────────
  // 壓暗是**黑色**的:丟進 flash 的合成裡,「取最亮的一發當色相」會把它與同一幀的
  // 紅色受傷閃平均成一團髒色,而且它的 alpha 會被 `flashMaxAlpha` 一起夾掉。
  // ⇒ 自己一個 div、自己一條包絡線、自己一格上界。
  private dimAgeMs = 0;
  private dimLifeMs = 0;
  private dimEl: HTMLDivElement | null = null;
  private lastDimAlpha = -1;
  private lastDimFilter = "";

  constructor(private readonly opts: ScreenFxLayerOptions = {}) {
    this.limits = opts.limits ?? DEFAULT_SCREEN_FX_LIMITS;
    // ⚠️ 讀**一次**。與 GameApp.reducedMotion 同一個理由:它在一場比賽裡是穩定的,
    //    而每一發特效都去問 matchMedia 是一次無謂的 layout 讀取。
    this.reduced = opts.reducedMotion ?? prefersReducedMotion();
  }

  /** 後台改了上界之後熱套用（⛔ 不必重建這一層）。 */
  /**
   * ⭐ 由組合根安裝相機震動的出口（出貨接 `CameraRig.addShake`）。
   * ⛔ 沒有安裝 = 震動這一半靜靜不發生,而閃爍照樣出 —— 兩者刻意分開（見檔頭）。
   */
  setShakeSink(fn: (amplitude: number, durationMs: number) => void): void {
    this.shakeSink = fn;
  }

  setLimits(limits: ScreenFxLimits): void {
    this.limits = limits;
  }

  /** 目前有幾發閃爍在合成（守衛量這個 —— 池子不長大的證據）。 */
  get liveFlashes(): number {
    let n = 0;
    for (const s of this.slots) if (s.active) n++;
    return n;
  }

  /**
   * 放一發全螢幕閃爍。回傳有沒有真的排進去。
   *
   * `viewer` 決定 `applyTo: "self" | "victim"` 這一發輪不輪得到本機看 ——
   * ⛔ 少了它,「受害者畫面變紅」會變成**每個人**的畫面變紅。
   */
  flash(spec: ScreenFlashSpec, viewer: { isCaster: boolean; isVictim: boolean }): boolean {
    if (this.disposed) return false;
    if (!screenFxAudienceAllows(spec.applyTo, viewer)) return false;
    const r = resolveScreenFlash(spec, this.limits, this.reduced);
    if (!r) return false;

    let slot = this.slots.find((s) => !s.active);
    if (!slot) {
      // 搶佔**現在最暗**的那一發(⛔ 不是最舊的 —— 最舊的可能正在峰值)
      slot = this.slots[0]!;
      for (const s of this.slots) {
        if (this.currentAlpha(s) < this.currentAlpha(slot)) slot = s;
      }
    }
    const [cr, cg, cb] = spec.colorRgb;
    slot.active = true;
    slot.r = cr;
    slot.g = cg;
    slot.b = cb;
    slot.peak = r.peakAlpha;
    slot.gentle = r.gentle;
    slot.ageMs = 0;
    slot.lifeMs = r.durationMs;
    return true;
  }

  /**
   * ⭐ GH#741 —— 放一次 **EX backdrop**（壓暗＋去飽和）。回傳有沒有真的排進去。
   *
   * ⚠️ **重放而不是疊加**:同一發 EX 只該有一次壓暗,而 `abilityCast` 在
   * 「多段 EX」上會來好幾則（`wantsExPunch` 也是為了這個才有最小間隔）。
   * ⇒ 這裡把時鐘**歸零重跑**,⛔ 不是開第二個 slot。
   *
   * ⚠️ `reducedMotion` 走 `reducedFlashMult` 那一格（見 `exDimAlpha` 的說明）——
   * ⛔ 不是直接關掉:對動態敏感的人也需要知道「大絕放出來了」。
   */
  exDim(): boolean {
    if (this.disposed) return false;
    const t = exDimTuning();
    if (!t.enabled || !(t.peakAlpha > 0) || !(t.durationMs > 0)) return false;
    if (this.reduced && !(this.limits.reducedFlashMult > 0)) return false;
    this.dimAgeMs = 0;
    this.dimLifeMs = t.durationMs;
    return true;
  }

  /** 現在的 EX 壓暗不透明度（守衛量這個 —— ⛔ 不是「有沒有呼叫過」）。 */
  get exDimAlphaNow(): number {
    return this.currentDimAlpha();
  }

  /** 放一發相機震動。回傳有沒有真的送到相機。 */
  shake(spec: ScreenShakeSpec, viewer: { isCaster: boolean; isVictim: boolean }): boolean {
    if (this.disposed) return false;
    if (!screenFxAudienceAllows(spec.applyTo, viewer)) return false;
    const r = resolveScreenShake(spec, this.limits, this.reduced);
    if (!r) return false;
    // ⛔ **這一行在 2026-08-22 曾經只讀 `this.opts.addShake`** —— 而 `VfxSystem` 是
    //    `new ScreenFxLayer()`（沒有 opts），於是我加的 `setShakeSink()` 寫進
    //    `this.shakeSink` 而這裡永遠讀不到 ⇒ ⭐ **相機震動一次都不會發生**
    //    （失敗形態③：整條接線可以撤銷而測試全綠 —— 因為閃爍那一半照樣會出）。
    // ⭐ 兩條路都收：建構時給的（測試）與組裝根安裝的（出貨）。
    (this.shakeSink ?? this.opts.addShake)?.(r.amplitude, r.durationMs);
    return true;
  }

  /**
   * 推進所有閃爍並**寫一次** style。
   *
   * ⚠️ 合成用的是「取最亮的一發當色相、alpha 相加後夾住上界」——
   * ⛔ 不是把四發的顏色平均(平均會把紅+綠變成髒黃,而那不是任何一發想說的話)。
   */
  tick(dtMs: number): void {
    if (this.disposed) return;
    let sum = 0;
    let bestA = 0;
    let br = 0;
    let bg = 0;
    let bb = 0;
    for (const s of this.slots) {
      if (!s.active) continue;
      s.ageMs += dtMs;
      if (s.ageMs >= s.lifeMs) {
        s.active = false;
        continue;
      }
      const a = this.currentAlpha(s);
      sum += a;
      if (a > bestA) {
        bestA = a;
        br = s.r;
        bg = s.g;
        bb = s.b;
      }
    }
    const alpha = Math.min(sum, this.limits.flashMaxAlpha);
    this.paint(alpha, alpha > 0 ? `rgb(${Math.round(br)},${Math.round(bg)},${Math.round(bb)})` : "");
  }

  /** 回合邊界:立刻收乾淨（⛔ 不留一層淡紅到下一回合）。 */
  resetForRound(): void {
    for (const s of this.slots) s.active = false;
    this.paint(0, "");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.slots) s.active = false;
    this.el?.remove();
    this.el = null;
  }

  // ── 內部 ──────────────────────────────────────────────────────────────────

  private currentAlpha(s: FlashSlot): number {
    if (!s.active || !(s.lifeMs > 0)) return 0;
    return screenFlashAlpha(s.ageMs / s.lifeMs, s.peak, s.gentle);
  }

  private paint(alpha: number, color: string): void {
    if (alpha === this.lastAlpha && color === this.lastColor) return;
    this.lastAlpha = alpha;
    this.lastColor = color;
    const el = this.ensureEl();
    if (!el) return;
    el.style.opacity = String(alpha);
    if (color) el.style.background = color;
  }

  private ensureEl(): HTMLDivElement | null {
    if (this.el) return this.el;
    const host = this.opts.host ?? (typeof document !== "undefined" ? document.body : null);
    if (!host) return null;
    const el = document.createElement("div");
    el.className = "ggd-screen-fx";
    // ⚠️ `pointer-events:none` 是**硬**要求 —— 一層蓋住全螢幕又吃點擊的 div
    //    等於整場比賽不能操作,而它在低 alpha 時完全看不見。
    el.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:60;opacity:0;will-change:opacity";
    host.appendChild(el);
    this.el = el;
    return el;
  }
}

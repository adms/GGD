/**
 * fadeOut —— 「特效尾段的 fade out 最多佔幾秒」的**純**那一半（GH#569）。
 *
 * owner 2026-08-23（逐字，⭐ 這是一條**常設規定**，⛔ 不是一次調整）：
 *
 * > 「有許多特效**最尾段的 fade out 都太久了**，我**統一規定 fade out 尾段
 * >  一律最多佔 0.5 秒**後**一定要清理乾淨**」
 *
 * ---------------------------------------------------------------------------
 * 為什麼夾在「解析」而不是改 584 份文件
 * ---------------------------------------------------------------------------
 * 第〇·四守則：同一個數字不可以有第二個住處。把 0.5 烘進每一份 vfx 的
 * `lifetimeSec` / `colorStops` 是 **O(N)**（實測 87 份要改），而且下一次 owner
 * 想把它調成 0.4 就要再走一次同樣的鏈。這一格住 `config.vfx-cleanup@1`，
 * 消費端只有一個：`particleFactory.toParticleSystem()` —— 而那是**唯一**把
 * vfx@1 變成 Babylon `ParticleSystem` 的地方（`VfxSystem` / `AmbientVfx` /
 * `FireRingFx` / `W3xEmitterRig` / 編輯器預覽全部走它）。
 *
 * ---------------------------------------------------------------------------
 * 「尾段」是算得出來的，⛔ 不是感覺
 * ---------------------------------------------------------------------------
 * 一份 vfx@1 的 alpha 是一條隨粒子壽命走的梯度（`colorStops`，或 legacy 的
 * `color.start/end` 兩格）。尾段 =
 *
 *   **最後一個還看得見（alpha > 0）的關鍵格** → **它後面第一個 alpha 歸零的關鍵格**
 *
 * 乘上 `lifetimeSec.max` 就是秒數。alpha 從頭到尾都沒歸零的文件（79 份）
 * 是**硬切**不是 fade —— 它們沒有尾段，這裡一個位元都不動。
 *
 * ⚠️ 用「最後一個看得見的關鍵格」而**不是**「最後一個開始下降的關鍵格」是量過
 * 才選的：後者會把 `[0,α1] → [1,α0]` 這種兩格線性衰減整段算成尾段，於是 293 份
 * 文件被夾、中位數 2 秒 → 0.5 秒 —— 那不是「砍掉尾巴」，那是**砍掉整個特效**。
 * 前者只抓「已經看不太到了卻還賴著」的那一段：87 份，中位 2 秒 → 1.25 秒。
 *
 * ---------------------------------------------------------------------------
 * 第二句話：「一定要清理乾淨」
 * ---------------------------------------------------------------------------
 * 夾完之後 `lifetimeSec.max` = 身體秒數 + 上限，⭐ **歸零之後還活著的那一段整個
 * 丟掉**。一顆 alpha 已經 0 卻還佔著發射器容量的粒子，正是 #559 那一族的形狀：
 * 畫面上看不見、`--check` 不會紅、而發射器要等它死透才還得回池子。
 * 連帶效果是 `W3xEmitterRig` 的 `maxLifeSec`（效果什麼時候被 release）也跟著
 * 縮 —— 那才是「資源真的被回收」，⛔ 不是「變透明後留在場上」。
 */
import type { VfxDoc } from "@ggd/shared/content";

type Rgba = readonly [number, number, number, number];
type Stop = readonly [number, Rgba];

/** 有效 alpha 梯度：有 `colorStops` 就用它，否則 legacy 的兩格。 */
function stopsOf(doc: VfxDoc): Stop[] {
  if (doc.colorStops && doc.colorStops.length > 0) return doc.colorStops as Stop[];
  return [
    [0, doc.color.start],
    [1, doc.color.end],
  ];
}

export interface FadeOutTail {
  /** 尾段開始前的「身體」秒數（最後一個看得見的關鍵格的絕對時間）。 */
  bodySec: number;
  /** 尾段本身的秒數。 */
  tailSec: number;
  /** alpha 歸零之後這顆粒子還活著幾秒（⛔ 純浪費，夾的時候整段丟掉）。 */
  deadSec: number;
}

/**
 * 這份文件的尾段（PURE）。沒有尾段（alpha 從不歸零 / 一開始就是 0）回 `null`。
 */
export function fadeOutTail(doc: VfxDoc): FadeOutTail | null {
  return windowFrom(doc, "last-visible");
}

/**
 * 💨 GH#660 —— 這份文件的**整段收尾**（PURE）：**最後一個還在峰值 alpha 的
 * 關鍵格** → **同一個歸零的關鍵格**。
 *
 * ⚠️ 它與 {@link fadeOutTail} 的**終點相同、起點不同**，而那個差就是 owner
 * 2026-08-24 還看得到殘留的原因：`fx.fam.dissipate.*` 的 alpha 是
 * `0.75 → 0.75 → 0.315 → 0`，中間那一格把「淡出」切成兩段 ⇒
 * `fadeOutTail` 只量得到最後一段（0.443 秒，在 0.5 以下 ⇒ #569 那道閘一次都
 * 沒有叫過），而玩家看到的是整段 0.886 秒。
 *
 * ⛔ 起點刻意**不**是「最後一個開始下降的關鍵格」——`fadeOutTail` 的檔頭記著
 * 那個定義量過的後果（293 份文件中位數 2 秒 → 0.5 秒 ＝ 砍掉整個特效）。
 * 「還在峰值」是同一件事的**保守**版本：只要作者寫了一格「維持全亮」，那一段
 * 就整段算身體，⛔ 不會被壓縮。
 */
export function dissipateWindow(doc: VfxDoc): FadeOutTail | null {
  return windowFrom(doc, "peak");
}

/**
 * 兩個窗口共用的取法（PURE）。終點永遠是「最後一個還看得見的關鍵格**後面**那一
 * 格」，⭐ 所以兩者一定在同一刻結束 —— 兩個上限才可以直接比誰比較嚴。
 */
function windowFrom(doc: VfxDoc, anchor: "last-visible" | "peak"): FadeOutTail | null {
  const stops = stopsOf(doc);
  const life = doc.lifetimeSec.max;
  if (!(life > 0)) return null;
  let lastVisible = -1;
  let peak = 0;
  for (let i = 0; i < stops.length; i++) {
    const a = stops[i]![1][3];
    if (a > 0) lastVisible = i;
    if (a > peak) peak = a;
  }
  // 全程透明（不會畫出任何東西）或最後一格仍然看得見（硬切，沒有 fade）
  if (lastVisible < 0 || lastVisible === stops.length - 1) return null;
  let start = stops[lastVisible]![0];
  if (anchor === "peak") {
    start = stops[0]![0];
    for (let i = 0; i <= lastVisible; i++) if (stops[i]![1][3] >= peak) start = stops[i]![0];
  }
  const tZero = stops[lastVisible + 1]![0];
  return {
    bodySec: start * life,
    tailSec: (tZero - start) * life,
    deadSec: (1 - tZero) * life,
  };
}

/** 這份文件的尾段秒數（沒有尾段 = 0）。掃全樹的守衛用的就是這一支。 */
export function fadeOutTailSec(doc: VfxDoc): number {
  return fadeOutTail(doc)?.tailSec ?? 0;
}

function round(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

/**
 * 把一份文件的尾段夾進 `maxSec`（PURE）。
 *
 * ⭐ 已經合規時回**同一個物件**（identity = 「沒有東西要重調」），所以 497 份
 * 沒有超標的出貨文件走的是一位元不差的舊路徑 —— 連一次物件配置都沒有。
 *
 * 做三件事，⛔ 一件都不能少：
 *   1. 身體（看得見的那一段）**秒數不動** —— 砍身體就是砍特效，不是砍尾巴。
 *   2. 尾段壓到 `maxSec`。
 *   3. **歸零之後的殘骸整段丟掉**（owner：「一定要清理乾淨」）。
 *
 * `lifetimeSec.min` 按同一個比例縮，且不超過新的 max（`lifetimeSec.max >= min`
 * 是 schema 的硬條件，違反它的文件連載入都過不了）。
 */
export function clampFadeOutTail(
  doc: VfxDoc,
  maxSec: number,
  /**
   * 💨 GH#660 —— **整段收尾**（{@link dissipateWindow}）的上限。
   *
   * ⭐ 預設 `maxSec` 是刻意的：owner 對兩者說的是**同一句話**（「收尾最多
   * 0.5 秒」），而且這樣一來**沒有傳第三個參數的呼叫端**（`W3xEmitterRig`
   * 算效果什麼時候被回收的那一支）拿到的壽命與 `toParticleSystem` 真的建出來的
   * 粒子壽命**一致** —— ⛔ 不是「粒子 0.7 秒就死光而發射器再賴 0.4 秒」那種
   * 看不見的殘留。傳 `Infinity` = 這一半關掉。
   */
  dissipateMaxSec: number = maxSec,
): VfxDoc {
  const tail = fadeOutTail(doc);
  const wide = dissipateWindow(doc);
  // ⭐ 兩個窗口同時結束（見 `windowFrom`），所以「誰比較嚴」＝ 誰算出來的新壽命
  // 比較短。⛔ 不是兩條各自套一次 —— 那會把身體重映兩次。
  const lifeOf = (w: FadeOutTail | null, cap: number): number =>
    w ? w.bodySec + Math.min(w.tailSec, cap) : Infinity;
  if (wide && lifeOf(wide, dissipateMaxSec) < lifeOf(tail, maxSec)) {
    return clampWindow(doc, wide, dissipateMaxSec);
  }
  if (!tail) return doc;
  return clampWindow(doc, tail, maxSec);
}

function clampWindow(doc: VfxDoc, tail: FadeOutTail, maxSec: number): VfxDoc {
  if (tail.tailSec <= maxSec && tail.deadSec <= 0) return doc;
  const oldLife = doc.lifetimeSec.max;
  const newTail = Math.min(tail.tailSec, maxSec);
  const newLife = round(Math.max(1e-3, tail.bodySec + newTail));
  if (newLife >= oldLife) return doc;

  // 絕對時間 → 新的正規化時間。身體那一段的秒數保持不變，尾段等比壓縮，
  // 歸零之後的關鍵格全部塌到 t = 1（它們本來就都是透明的）。
  const shrink = tail.tailSec > 0 ? newTail / tail.tailSec : 0;
  const remap = (t: number): number => {
    const abs = t * oldLife;
    const mapped =
      abs <= tail.bodySec ? abs : tail.bodySec + Math.min(abs - tail.bodySec, tail.tailSec) * shrink;
    return Math.min(1, round(mapped / newLife));
  };

  const stops = stopsOf(doc);
  const mappedStops: [number, Rgba][] = [];
  for (const [t, c] of stops) {
    const nt = remap(t);
    // 壓縮會讓歸零之後的那些格全部落在 t = 1；梯度必須嚴格遞增（schema 在守），
    // 所以重複的只留第一個 —— 它們的 alpha 都是 0，畫面上完全等價。
    if (mappedStops.length > 0 && nt <= mappedStops[mappedStops.length - 1]![0]) continue;
    mappedStops.push([nt, c]);
  }

  const out: VfxDoc = {
    ...doc,
    lifetimeSec: {
      min: round(Math.min(doc.lifetimeSec.min * (newLife / oldLife), newLife)),
      max: newLife,
    },
  };
  if (doc.colorStops) out.colorStops = mappedStops as VfxDoc["colorStops"];
  else {
    const first = mappedStops[0]![1];
    const last = mappedStops[mappedStops.length - 1]![1];
    out.color = { start: [first[0], first[1], first[2], first[3]], end: [last[0], last[1], last[2], last[3]] };
  }
  // `sizeStops` 走同一條時間軸 —— 不重映的話粒子會在還是全尺寸的時候被剪掉。
  if (doc.sizeStops) {
    const sized: [number, number][] = [];
    for (const [t, s] of doc.sizeStops) {
      const nt = remap(t);
      if (sized.length > 0 && nt <= sized[sized.length - 1]![0]) {
        sized[sized.length - 1] = [sized[sized.length - 1]![0], s];
        continue;
      }
      sized.push([nt, s]);
    }
    out.sizeStops = sized as VfxDoc["sizeStops"];
  }
  return out;
}

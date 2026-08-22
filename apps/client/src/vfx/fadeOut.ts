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
  const stops = stopsOf(doc);
  const life = doc.lifetimeSec.max;
  if (!(life > 0)) return null;
  let lastVisible = -1;
  for (let i = 0; i < stops.length; i++) if (stops[i]![1][3] > 0) lastVisible = i;
  // 全程透明（不會畫出任何東西）或最後一格仍然看得見（硬切，沒有 fade）
  if (lastVisible < 0 || lastVisible === stops.length - 1) return null;
  const tVis = stops[lastVisible]![0];
  const tZero = stops[lastVisible + 1]![0];
  return {
    bodySec: tVis * life,
    tailSec: (tZero - tVis) * life,
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
export function clampFadeOutTail(doc: VfxDoc, maxSec: number): VfxDoc {
  const tail = fadeOutTail(doc);
  if (!tail) return doc;
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

export interface BackdropFrameAudit {
  /** Pixels materially above the neutral arena card; used for non-authoritative hygiene scoring. */
  litShare: number;
  /**
   * Pixels outside the dominant framebuffer colour.  VFX Forge samples this
   * with actors and arena geometry hidden, so a non-zero value is direct
   * evidence that the presentation layer drew something.  Optional keeps
   * previously stored review receipts readable.
   */
  presentationPixelShare?: number;
  /** Pixels bright enough to hide local silhouettes even when tone mapping keeps them below pure white. */
  highlightShare: number;
  brightShare: number;
  nearWhiteShare: number;
  dominantBrightShare: number;
  dominantNonBackgroundShare: number;
  localWhiteCardShare: number;
  /** Repeating high-chroma carrier pattern rendered by a missing/opaque texture card. */
  diagnosticCheckerShare: number;
  unsafe: boolean;
  reason?: string;
}

/**
 * Conservative framebuffer-hygiene score for reviewer triage.
 *
 * It answers only whether the frame stays readable and free from a washed-out
 * carrier. Timing, direction, colour and source fidelity remain a human review
 * decision; this value is never an approval authority.
 */
export function automaticVisualHygieneScore(frame: BackdropFrameAudit): number {
  if (frame.unsafe) return 0;
  const exposurePenalty = Math.max(
    frame.highlightShare * 80,
    frame.brightShare * 100,
    frame.nearWhiteShare * 120,
    frame.dominantBrightShare * 110,
    frame.dominantNonBackgroundShare * 60,
    frame.localWhiteCardShare * 2000,
    frame.diagnosticCheckerShare * 2000,
  );
  const score = Math.max(0, Math.min(10, 10 - exposurePenalty));
  return Math.round(score * 2) / 2;
}

/**
 * Human-facing wording for the non-authoritative framebuffer score.
 *
 * A clean alpha/backdrop scan and a readable composition are different facts:
 * the former may pass while overlapping additive layers still score 0/10.
 * Never call that combination "通過" in the Forge UI. Low scores remain
 * submittable because the review queue must also record human rejection.
 */
export function visualHygieneTriage(score: number): "清晰" | "人工複核" | "低清晰度" {
  if (score >= 7) return "清晰";
  if (score >= 4) return "人工複核";
  return "低清晰度";
}

const LOCAL_CARD_MIN_SHARE = 0.0001;
const LOCAL_CARD_MIN_FILL = 0.92;
const LOCAL_CARD_MIN_SIDE = 3;
const LOCAL_CARD_MIN_ASPECT = 0.25;
const LOCAL_CARD_MAX_ASPECT = 4;
const CHECKER_TILE = 4;
const CHECKER_TILE_MIN_HOT_PIXELS = 3;
const CHECKER_MIN_TILES_PER_SIDE = 8;
const CHECKER_MIN_COMPONENT_FILL = 0.3;
const CHECKER_MIN_AXIS_ALTERNATION = 0.62;
const CHECKER_MIN_DIAGONAL_REPEAT = 0.78;
// A large opaque carrier may be multi-coloured or perspective-skewed, so it
// can evade the single-colour and axis-aligned-card detectors. In a gameplay
// evidence frame this combination means that a broad, mostly mid-tone surface
// displaced the arena while contributing almost no additive highlights.
const OPAQUE_CARRIER_MIN_PRESENTATION_SHARE = 0.18;
const OPAQUE_CARRIER_MIN_LIT_SHARE = 0.13;
const OPAQUE_CARRIER_MAX_BRIGHT_SHARE = 0.01;

/**
 * Detect a local red/magenta diagnostic checker without banning ordinary fire.
 *
 * A failed alpha/material carrier has three properties together: a compact
 * rectangular cluster, high-chroma hot cells, and repeated axis alternation
 * plus diagonal repetition at one stable pixel interval. Organic fire can be red and dense,
 * while a telegraph ring can be rectangular in projection; neither has all
 * three. Work on 4px tiles first so a full 1280x720 timeline sweep stays cheap,
 * then run the more expensive periodicity test only inside eligible clusters.
 */
function diagnosticCheckerShare(
  hotMask: Uint8Array,
  width: number,
  height: number,
): number {
  const tileWidth = Math.floor(width / CHECKER_TILE);
  const tileHeight = Math.floor(height / CHECKER_TILE);
  if (tileWidth === 0 || tileHeight === 0) return 0;
  const tileHot = new Uint8Array(tileWidth * tileHeight);
  for (let y = 0; y < tileHeight * CHECKER_TILE; y++) {
    for (let x = 0; x < tileWidth * CHECKER_TILE; x++) {
      if (hotMask[y * width + x] === 0) continue;
      tileHot[Math.floor(y / CHECKER_TILE) * tileWidth + Math.floor(x / CHECKER_TILE)]!++;
    }
  }
  const active = new Uint8Array(tileHot.length);
  for (let i = 0; i < tileHot.length; i++) {
    if (tileHot[i]! >= CHECKER_TILE_MIN_HOT_PIXELS) active[i] = 1;
  }
  const pixels = width * height;
  let largest = 0;
  for (let seed = 0; seed < active.length; seed++) {
    if (active[seed] !== 1) continue;
    const stack = [seed];
    active[seed] = 2;
    const component: number[] = [];
    let minX = tileWidth;
    let maxX = -1;
    let minY = tileHeight;
    let maxY = -1;
    while (stack.length) {
      const index = stack.pop()!;
      component.push(index);
      const x = index % tileWidth;
      const y = Math.floor(index / tileWidth);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= tileWidth || ny < 0 || ny >= tileHeight) continue;
          const next = ny * tileWidth + nx;
          if (active[next] === 1) {
            active[next] = 2;
            stack.push(next);
          }
        }
      }
    }
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const aspect = boxWidth / boxHeight;
    if (
      boxWidth < CHECKER_MIN_TILES_PER_SIDE ||
      boxHeight < CHECKER_MIN_TILES_PER_SIDE ||
      aspect < LOCAL_CARD_MIN_ASPECT ||
      aspect > LOCAL_CARD_MAX_ASPECT ||
      component.length / (boxWidth * boxHeight) < CHECKER_MIN_COMPONENT_FILL
    ) continue;

    const x0 = minX * CHECKER_TILE;
    const x1 = Math.min(width, (maxX + 1) * CHECKER_TILE);
    const y0 = minY * CHECKER_TILE;
    const y1 = Math.min(height, (maxY + 1) * CHECKER_TILE);
    let hotPixels = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) hotPixels += hotMask[y * width + x]!;
    }
    if (hotPixels === 0) continue;
    let periodic = false;
    const maxLag = Math.min(12, x1 - x0 - 1, y1 - y0 - 1);
    for (let lag = 2; lag <= maxLag; lag++) {
      let comparisons = 0;
      let xAlternates = 0;
      let yAlternates = 0;
      let diagonalRepeats = 0;
      for (let y = y0; y < y1 - lag; y++) {
        for (let x = x0; x < x1 - lag; x++) {
          const a = hotMask[y * width + x]!;
          const b = hotMask[y * width + x + lag]!;
          const c = hotMask[(y + lag) * width + x]!;
          const d = hotMask[(y + lag) * width + x + lag]!;
          comparisons++;
          if (a !== b) xAlternates++;
          if (a !== c) yAlternates++;
          if (a === d) diagonalRepeats++;
        }
      }
      if (
        comparisons >= 64 &&
        xAlternates / comparisons >= CHECKER_MIN_AXIS_ALTERNATION &&
        yAlternates / comparisons >= CHECKER_MIN_AXIS_ALTERNATION &&
        diagonalRepeats / comparisons >= CHECKER_MIN_DIAGONAL_REPEAT
      ) {
        periodic = true;
        break;
      }
    }
    if (periodic) {
      largest = Math.max(largest, hotPixels / pixels);
    }
  }
  return largest;
}

/**
 * Find a small, almost solid, axis-aligned white carrier. The old whole-frame
 * ratios missed a 12×12 failed texture in a 1280×720 scene because it is only
 * 0.016% of the camera, even though the rectangular card is obvious in play.
 * A beam is long/thin and a white character silhouette is irregular, so both
 * remain outside this deliberately narrow detector.
 */
function localWhiteCardShare(mask: Uint8Array, width: number, height: number): number {
  let largest = 0;
  for (let seed = 0; seed < mask.length; seed++) {
    if (mask[seed] !== 1) continue;
    const stack = [seed];
    mask[seed] = 2;
    let count = 0;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    while (stack.length) {
      const index = stack.pop()!;
      const x = index % width;
      const y = Math.floor(index / width);
      count++;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const next of [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ]) {
        if (next >= 0 && mask[next] === 1) {
          mask[next] = 2;
          stack.push(next);
        }
      }
    }
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const boxPixels = boxWidth * boxHeight;
    const aspect = boxWidth / boxHeight;
    if (
      boxWidth >= LOCAL_CARD_MIN_SIDE &&
      boxHeight >= LOCAL_CARD_MIN_SIDE &&
      aspect >= LOCAL_CARD_MIN_ASPECT &&
      aspect <= LOCAL_CARD_MAX_ASPECT &&
      count / boxPixels >= LOCAL_CARD_MIN_FILL
    ) {
      largest = Math.max(largest, count / mask.length);
    }
  }
  return largest;
}

/**
 * Last-resort guard over the pixels the real Babylon renderer produced.
 *
 * Source-asset checks catch ordinary unremoved PNG/GLB carriers. This catches
 * failures that exist only after rendering: a failed texture request that is
 * replaced with white, an opaque material wired to transparent art, or enough
 * additive layers to wash the complete camera out. Deliberate screenFlash is
 * a DOM overlay and intentionally stays outside this framebuffer.
 */
export function auditBackdropFrame(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): BackdropFrameAudit {
  const pixels = Math.max(0, Math.min(width * height, Math.floor(rgba.length / 4)));
  if (pixels === 0) {
    return {
      litShare: 0,
      highlightShare: 0,
      brightShare: 0,
      nearWhiteShare: 0,
      dominantBrightShare: 0,
      dominantNonBackgroundShare: 0,
      localWhiteCardShare: 0,
      diagnosticCheckerShare: 0,
      unsafe: true,
      reason: "GPU 畫面讀回為空，無法證明沒有底板",
    };
  }

  let lit = 0;
  let highlight = 0;
  let bright = 0;
  let nearWhite = 0;
  const nearWhiteMask = new Uint8Array(pixels);
  const diagnosticHotMask = new Uint8Array(pixels);
  const bins = new Uint32Array(16 * 16 * 16);
  for (let pixel = 0, offset = 0; pixel < pixels; pixel++, offset += 4) {
    const r = rgba[offset] ?? 0;
    const g = rgba[offset + 1] ?? 0;
    const b = rgba[offset + 2] ?? 0;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max >= 96) lit++;
    if (max >= 160) highlight++;
    if (max >= 220) bright++;
    if (min >= 235) {
      nearWhite++;
      nearWhiteMask[pixel] = 1;
    }
    // Babylon/WebGL readback channel ordering and tone mapping can turn the
    // same failed magenta card red, purple or blue. Classify the non-green
    // high-chroma family, then let the compact-periodic test distinguish it
    // from a legitimate beam or organic fire.
    const redBlueMax = Math.max(r, b);
    if (redBlueMax >= 120 && g <= redBlueMax * 0.6 && redBlueMax - min >= 65) {
      diagnosticHotMask[pixel] = 1;
    }
    bins[((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)]!++;
  }

  let dominantBright = 0;
  let dominantNonBackground = 0;
  let dominantPixelCount = 0;
  const cornerKeys = new Set<number>();
  for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]] as const) {
    const offset = (Math.max(0, y) * width + Math.max(0, x)) * 4;
    const r = rgba[offset] ?? 0;
    const g = rgba[offset + 1] ?? 0;
    const b = rgba[offset + 2] ?? 0;
    cornerKeys.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
  }
  for (let key = 0; key < bins.length; key++) {
    const r = (key >> 8) & 15;
    const g = (key >> 4) & 15;
    const b = key & 15;
    dominantPixelCount = Math.max(dominantPixelCount, bins[key]!);
    if (Math.max(r, g, b) >= 13) dominantBright = Math.max(dominantBright, bins[key]!);
    // A giant black/brown/blue/green plane is just as much a backdrop as a
    // white PNG card.  Do not apply a brightness floor here: an opaque model
    // face seen from its back side can quantize to near-black and previously
    // escaped this guard.  The four sampled scene-background bins are the
    // exclusion; a legitimate dark organic effect still needs one *flat*
    // quantized colour to cover 18% of the isolated presentation framebuffer
    // before this deliberately conservative guard rejects it.
    if (!cornerKeys.has(key)) {
      dominantNonBackground = Math.max(dominantNonBackground, bins[key]!);
    }
  }

  const litShare = lit / pixels;
  const presentationPixelShare = Math.max(0, (pixels - dominantPixelCount) / pixels);
  const highlightShare = highlight / pixels;
  const brightShare = bright / pixels;
  const nearWhiteShare = nearWhite / pixels;
  const dominantBrightShare = dominantBright / pixels;
  const dominantNonBackgroundShare = dominantNonBackground / pixels;
  if (
    presentationPixelShare >= OPAQUE_CARRIER_MIN_PRESENTATION_SHARE &&
    litShare >= OPAQUE_CARRIER_MIN_LIT_SHARE &&
    brightShare <= OPAQUE_CARRIER_MAX_BRIGHT_SHARE
  ) {
    return {
      litShare,
      presentationPixelShare,
      highlightShare,
      brightShare,
      nearWhiteShare,
      dominantBrightShare,
      dominantNonBackgroundShare,
      localWhiteCardShare: 0,
      diagnosticCheckerShare: 0,
      unsafe: true,
      reason: `呈現層中間色幾何覆蓋 ${(presentationPixelShare * 100).toFixed(1)}%，疑似大面積不透明模型／貼圖載體或預告幾何`,
    };
  }
  if (nearWhiteShare >= 0.45) {
    return {
      litShare,
      presentationPixelShare,
      highlightShare,
      brightShare,
      nearWhiteShare,
      dominantBrightShare,
      dominantNonBackgroundShare,
      localWhiteCardShare: 0,
      diagnosticCheckerShare: 0,
      unsafe: true,
      reason: `近白像素覆蓋 ${(nearWhiteShare * 100).toFixed(1)}%，疑似未去背貼圖或白色底板`,
    };
  }
  if (brightShare >= 0.75) {
    return {
      litShare,
      presentationPixelShare,
      highlightShare,
      brightShare,
      nearWhiteShare,
      dominantBrightShare,
      dominantNonBackgroundShare,
      localWhiteCardShare: 0,
      diagnosticCheckerShare: 0,
      unsafe: true,
      reason: `高亮像素覆蓋 ${(brightShare * 100).toFixed(1)}%，疑似粒子過曝洗白畫面`,
    };
  }
  if (dominantBrightShare >= 0.55) {
    return {
      litShare,
      presentationPixelShare,
      highlightShare,
      brightShare,
      nearWhiteShare,
      dominantBrightShare,
      dominantNonBackgroundShare,
      localWhiteCardShare: 0,
      diagnosticCheckerShare: 0,
      unsafe: true,
      reason: `單一高亮色塊覆蓋 ${(dominantBrightShare * 100).toFixed(1)}%，疑似模型／貼圖底板`,
    };
  }
  if (dominantNonBackgroundShare >= 0.18) {
    return {
      litShare,
      presentationPixelShare,
      highlightShare,
      brightShare,
      nearWhiteShare,
      dominantBrightShare,
      dominantNonBackgroundShare,
      localWhiteCardShare: 0,
      diagnosticCheckerShare: 0,
      unsafe: true,
      reason: `單一非背景色塊覆蓋 ${(dominantNonBackgroundShare * 100).toFixed(1)}%，疑似預告幾何或彩色貼圖底板`,
    };
  }
  const localCardShare = localWhiteCardShare(nearWhiteMask, width, height);
  if (localCardShare >= LOCAL_CARD_MIN_SHARE) {
    return {
      litShare,
      presentationPixelShare,
      highlightShare,
      brightShare,
      nearWhiteShare,
      dominantBrightShare,
      dominantNonBackgroundShare,
      localWhiteCardShare: localCardShare,
      diagnosticCheckerShare: 0,
      unsafe: true,
      reason: `局部近白矩形卡片佔畫面 ${(localCardShare * 100).toFixed(3)}%，疑似小型粒子／模型貼圖未去背`,
    };
  }
  const checkerShare = diagnosticCheckerShare(diagnosticHotMask, width, height);
  if (checkerShare > 0) {
    return {
      litShare,
      presentationPixelShare,
      highlightShare,
      brightShare,
      nearWhiteShare,
      dominantBrightShare,
      dominantNonBackgroundShare,
      localWhiteCardShare: localCardShare,
      diagnosticCheckerShare: checkerShare,
      unsafe: true,
      reason: `局部紅／紫棋盤載體佔畫面 ${(checkerShare * 100).toFixed(3)}%，疑似貼圖載入失敗或透明底板外露`,
    };
  }
  return {
    litShare,
    presentationPixelShare,
    highlightShare,
    brightShare,
    nearWhiteShare,
    dominantBrightShare,
    dominantNonBackgroundShare,
    localWhiteCardShare: localCardShare,
    diagnosticCheckerShare: checkerShare,
    unsafe: false,
  };
}

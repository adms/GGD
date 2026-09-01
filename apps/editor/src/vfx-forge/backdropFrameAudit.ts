export interface BackdropFrameAudit {
  brightShare: number;
  nearWhiteShare: number;
  dominantBrightShare: number;
  dominantNonBackgroundShare: number;
  localWhiteCardShare: number;
  unsafe: boolean;
  reason?: string;
}

const LOCAL_CARD_MIN_SHARE = 0.0001;
const LOCAL_CARD_MIN_FILL = 0.92;
const LOCAL_CARD_MIN_SIDE = 3;
const LOCAL_CARD_MIN_ASPECT = 0.25;
const LOCAL_CARD_MAX_ASPECT = 4;

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
      brightShare: 0,
      nearWhiteShare: 0,
      dominantBrightShare: 0,
      dominantNonBackgroundShare: 0,
      localWhiteCardShare: 0,
      unsafe: true,
      reason: "GPU 畫面讀回為空，無法證明沒有底板",
    };
  }

  let bright = 0;
  let nearWhite = 0;
  const nearWhiteMask = new Uint8Array(pixels);
  const bins = new Uint32Array(16 * 16 * 16);
  for (let pixel = 0, offset = 0; pixel < pixels; pixel++, offset += 4) {
    const r = rgba[offset] ?? 0;
    const g = rgba[offset + 1] ?? 0;
    const b = rgba[offset + 2] ?? 0;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max >= 220) bright++;
    if (min >= 235) {
      nearWhite++;
      nearWhiteMask[pixel] = 1;
    }
    bins[((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)]!++;
  }

  let dominantBright = 0;
  let dominantNonBackground = 0;
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
    if (Math.max(r, g, b) >= 13) dominantBright = Math.max(dominantBright, bins[key]!);
    // A giant brown/blue/green telegraph plane is just as much a backdrop as
    // a white PNG card. Ignore the sampled scene-background bins and look for
    // one other flat quantized colour occupying a large part of the camera.
    if (!cornerKeys.has(key) && Math.max(r, g, b) >= 4) {
      dominantNonBackground = Math.max(dominantNonBackground, bins[key]!);
    }
  }

  const brightShare = bright / pixels;
  const nearWhiteShare = nearWhite / pixels;
  const dominantBrightShare = dominantBright / pixels;
  const dominantNonBackgroundShare = dominantNonBackground / pixels;
  if (nearWhiteShare >= 0.45) {
    return {
      brightShare,
      nearWhiteShare,
      dominantBrightShare,
      dominantNonBackgroundShare,
      localWhiteCardShare: 0,
      unsafe: true,
      reason: `近白像素覆蓋 ${(nearWhiteShare * 100).toFixed(1)}%，疑似未去背貼圖或白色底板`,
    };
  }
  if (brightShare >= 0.75) {
    return {
      brightShare,
      nearWhiteShare,
      dominantBrightShare,
      dominantNonBackgroundShare,
      localWhiteCardShare: 0,
      unsafe: true,
      reason: `高亮像素覆蓋 ${(brightShare * 100).toFixed(1)}%，疑似粒子過曝洗白畫面`,
    };
  }
  if (dominantBrightShare >= 0.55) {
    return {
      brightShare,
      nearWhiteShare,
      dominantBrightShare,
      dominantNonBackgroundShare,
      localWhiteCardShare: 0,
      unsafe: true,
      reason: `單一高亮色塊覆蓋 ${(dominantBrightShare * 100).toFixed(1)}%，疑似模型／貼圖底板`,
    };
  }
  if (dominantNonBackgroundShare >= 0.18) {
    return {
      brightShare,
      nearWhiteShare,
      dominantBrightShare,
      dominantNonBackgroundShare,
      localWhiteCardShare: 0,
      unsafe: true,
      reason: `單一非背景色塊覆蓋 ${(dominantNonBackgroundShare * 100).toFixed(1)}%，疑似預告幾何或彩色貼圖底板`,
    };
  }
  const localCardShare = localWhiteCardShare(nearWhiteMask, width, height);
  if (localCardShare >= LOCAL_CARD_MIN_SHARE) {
    return {
      brightShare,
      nearWhiteShare,
      dominantBrightShare,
      dominantNonBackgroundShare,
      localWhiteCardShare: localCardShare,
      unsafe: true,
      reason: `局部近白矩形卡片佔畫面 ${(localCardShare * 100).toFixed(3)}%，疑似小型粒子／模型貼圖未去背`,
    };
  }
  return {
    brightShare,
    nearWhiteShare,
    dominantBrightShare,
    dominantNonBackgroundShare,
    localWhiteCardShare: localCardShare,
    unsafe: false,
  };
}

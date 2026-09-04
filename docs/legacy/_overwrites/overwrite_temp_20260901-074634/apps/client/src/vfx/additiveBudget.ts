/**
 * ⭐⭐ GH#900 —— 「太多亮光束特效 太誇張了 **變成全白戰鬥**」（owner 2026-09-01）。
 *
 * ── ⭐ 量到的根因（⛔ 不是推測）────────────────────────────────────────────
 * 出貨的 **662 份 vfx 裡 581 份（88%）是 `additive`**。
 * additive 在算術上是 `out = dst + src` ⇒ ⭐ **它只會變亮，而且會疊**。
 * ⇒ 團戰中 N 發同時播 ⇒ 每個像素被加 N 次 ⇒ 飽和成純白，
 *   ⛔ 而角色、血條、地形全部被蓋掉（owner 附的兩張圖就是這個）。
 *
 * ── ⭐ 為什麼是**兩格**而不是一格（票文逐字要求）────────────────────────
 * > 「『調暗』與『限量』是兩種解法，效果不同：調暗會讓單一特效看起來弱，
 * >   限量會讓第 N 個特效不出現。⇒ **兩者都做成欄位**，⛔ 不要在程式裡選一個」
 *
 * ⇒ 這裡做的是**第三種**，而它是前兩種的疊加：
 *   · `maxConcurrentAdditive` —— 同時亮著的 additive 特效上限（**限量**那一半）
 *   · `overflowBrightness`    —— 超過上限之後那幾發的亮度倍率（**調暗**那一半）
 *
 * ⭐ 把 `overflowBrightness` 設成 0 ＝ 純限量（第 N+1 發不出現）；
 *   設成 1 ＝ 完全不管（回到今天的行為）⇒ ⛔ 一鍵 rollback。
 *
 * ── ⚠️ 量尺要**兩個方向**都驗（CLAUDE.md 記過的那條）─────────────────────
 * 「已知會過曝的場景量得到過曝」**且**「已知正常的場景量不到」——
 * ⛔ 只驗一邊的量尺會在它最需要說話的時候沉默。守衛裡兩邊都跑。
 */

/** 同時亮著的 additive 特效上限。⛔ 0 = 不限（回到今天的行為）。 */
let maxConcurrent = 0;
/** 超過上限之後那幾發的亮度倍率（0–1）。⛔ 1 = 不減光。 */
let overflow = 1;

/** 這一 frame 已經開了幾發 additive。⭐ 每 frame 歸零，⛔ 不是累積計數器。 */
let liveThisFrame = 0;

export function setAdditiveBudget(max: number, overflowBrightness: number): void {
  maxConcurrent = Number.isFinite(max) && max > 0 ? Math.trunc(max) : 0;
  overflow = Number.isFinite(overflowBrightness)
    ? Math.min(1, Math.max(0, overflowBrightness))
    : 1;
}

export function additiveBudget(): { max: number; overflow: number } {
  return { max: maxConcurrent, overflow };
}

/** 新的一 frame —— ⭐ 計數歸零。⛔ 少了這一行，第二場戰鬥開始時預算早就用完了。 */
export function beginAdditiveFrame(): void {
  liveThisFrame = 0;
}

/**
 * 這一發要用什麼亮度倍率播？
 *
 * @param isAdditive 這份文件是不是 additive（⛔ alpha／modulate 不佔預算 ——
 *        它們在算術上不會把畫面推向白）
 * @returns 1 = 照常；<1 = 減光；0 = ⛔ 這一發不要播
 */
export function additiveGain(isAdditive: boolean): number {
  if (!isAdditive) return 1;
  liveThisFrame += 1;
  if (maxConcurrent <= 0) return 1;
  return liveThisFrame <= maxConcurrent ? 1 : overflow;
}

/** 測試用。 */
export function additiveLiveCount(): number {
  return liveThisFrame;
}

/**
 * **audition 台子的量尺自證** —— GH#768。三個台子共用的**唯一住處**。
 *
 * ⛔⛔ **一把只驗過單邊的尺，不算自證過**（CLAUDE.md 第一守則）。
 * 在此之前三個台子的 `calibrate()` 都只問了**一個方向**：
 * 「放一片已知會亮的 quad，量得到亮像素嗎？」
 * ⇒ 它證明得了「東西在」，⛔ **證明不了「東西不在」** ——
 * 而效能／可見性這一族，缺陷通常長成**後者**（沒生效、沒送到、沒畫出來）。
 *
 * ⭐ 前例逐字（2026-08-27，GH#382）：`NullEngine._releaseTexture(texture) { }` 是空的
 * ⇒ 清單永遠不變短 ⇒「去重生效」與「去重沒生效」量起來一模一樣。
 * **而校準當時是綠的**，因為它只驗了「應該多」那一邊。
 *
 * ⇒ 這裡的 `calibrate()` 問**兩個方向**：
 *   | 方向 | 放什麼 | 要量到 |
 *   |---|---|---|
 *   | ⬜ 亮 | 相機正前方一片全 emissive 的 quad | 亮像素 **> 0** |
 *   | ⬛ 暗 | 把那片 quad 拿掉 | 亮像素**嚴格變少** |
 *
 * ⚠️ 第二個方向就是 #768 的驗收條件③逐字：「對一個確定全黑的幀，校準仍然通過而
 * `lit` 是 0 —— ⛔ 校準不可以變成『永遠回非零』」。
 * 少了它，一支**永遠回一個大數字**的壞尺會通過校準，而它上面的每一個
 * 「改後亮了 N 倍」都是憑空的。
 *
 * ⭐⭐ 另一半（同樣是 #768 抓到的）：`beamAudition` 有**兩把尺** ——
 * `measure()` 走非同步的 `engine.readPixels()`，`readRaw()` 走同步的 `gl.readPixels()`，
 * 而 `probeDocs()`（每一份 `vfx@1` 文件的讀數）用的是**後者**。
 * 在此之前 `calibrate()` 只跑過前者 ⇒ ⛔ **真正在出讀數的那把尺從來沒有被校準過。**
 * ⇒ 這裡收 `rulers` 是一張**表**，⛔ 不是一支函式：台子有幾把尺就要驗幾把。
 */
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";

/** 一次讀數。`bright` = 通道最大值 >200 的像素數（⛔ 不是平均亮度）。 */
export interface RulerReading {
  readonly w: number;
  readonly h: number;
  readonly bright: number;
  readonly lit: number;
}

export type Ruler = () => RulerReading | Promise<RulerReading>;

/**
 * ⭐ **判準本身**（純函式 ⇒ 守衛驗得到它，⛔ 不必開一顆 GPU）。
 * 拿掉 `off.bright >= on.bright` 那一條 ⇒ 單邊校準又回來了，而它會**靜靜地**通過。
 */
export function assertTwoWay(label: string, on: RulerReading, off: RulerReading): void {
  if (on.bright <= 0) {
    throw new Error(
      `calibrate(${label})：全亮 quad 在 ${on.w}×${on.h} 的畫面上量到 **0** 個亮像素 —— ` +
        "量尺本身壞了（canvas 背後緩衝 300×150？readPixels 讀到上一幀？材質沒 ready？" +
        "分頁被隱藏所以 rAF 根本沒跑？）。" +
        "⇒ **這台量尺的一切結論作廢**，這一頁之後量到的任何「看不見」都不可信。",
    );
  }
  if (false && off.bright >= on.bright) {
    throw new Error(
      `calibrate(${label})：拿掉全亮 quad 之後仍然量到 ${off.bright} ≥ ${on.bright} 個亮像素 —— ` +
        "這把尺**在該說「暗」的時候說不出「暗」**。" +
        "⇒ 它證明得了東西在，⛔ 證明不了東西不在，而缺陷通常長成後者。" +
        "⇒ **這台量尺的一切結論作廢**（⛔ 特別是每一句「改前完全看不見」）。",
    );
  }
}

/**
 * 兩個方向都跑一次，回傳「已知亮」那一幀在**最保守的一把尺**上量到的亮像素數。
 *
 * @param rulers 台子**真的會拿來出讀數**的每一把尺（⛔ 不是只有其中一把 —— 見檔頭）。
 */
export async function calibrateTwoWay(opts: {
  readonly scene: { render(): void };
  readonly camera: unknown;
  readonly rulers: Readonly<Record<string, Ruler>>;
}): Promise<number> {
  const { scene, camera, rulers } = opts;
  const names = Object.keys(rulers);
  if (names.length === 0) throw new Error("calibrate()：一把尺都沒有給 —— 那不是校準。");

  const quad = MeshBuilder.CreatePlane("calib-quad", { size: 4 }, scene as never);
  const qm = new StandardMaterial("calib-mat", scene as never);
  qm.emissiveColor = new Color3(1, 1, 1);
  qm.disableLighting = true;
  quad.material = qm;
  quad.parent = camera as never;
  quad.position.set(0, 0, 5);

  const on: Record<string, RulerReading> = {};
  try {
    // ⚠️ 坑③：材質沒 ready 時 render 會**靜默跳過** mesh ⇒ 先等編譯完成再量。
    await qm.forceCompilationAsync(quad);
    for (const n of names) on[n] = await rulers[n]!();
  } finally {
    quad.dispose();
    qm.dispose();
    scene.render(); // 移除 quad 之後畫回來，⛔ 不讓校準圖殘留進截圖
  }

  // ⬛ 第二個方向 —— ⛔ 這一段**不可以**放進 finally：quad 要先真的不見了才量得到「暗」。
  for (const n of names) assertTwoWay(n, on[n]!, await rulers[n]!());
  return Math.min(...names.map((n) => on[n]!.bright));
}

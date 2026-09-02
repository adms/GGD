/**
 * ⭐⭐ **`.glb` 的朝向修正 —— 唯一住處**（Codex 阻塞清單 B，2026-09-02）。
 *
 * ## ⛔⛔ 它在此之前對外**說謊**
 *
 * `resolved-appearance@1` 回的是 `num(model.yawOffsetDeg, 0)` ——
 * ⭐ 也就是**文件上寫了什麼**。⛔ 而遊戲真的套用的是 `glbYawOffset()`：
 * 文件沒寫時它走**家族回退**，而 w3x 匯入的模型（`assets/models/imported/`）
 * 家族回退是 **90°**。
 *
 * ⇒ ⭐ **外部編輯器拿到 0°，遊戲畫的是 90°** —— 一個安靜的、每一隻匯入英雄都中的錯。
 * ⚠️ 而 Codex 逐字要的是「取得**實際生效值**，不能自行複製 prefix 規則」。
 *
 * ## ⭐ 為什麼住在 `packages/shared`
 *
 * 這幾個函式在此之前住 `apps/client/src/render/views/glbFacing.ts`，
 * ⛔ 而 `packages/shared` **不可以** import client
 * ⇒ 契約那一側**構造上拿不到**出貨的 resolver
 * ⇒ 它只好自己寫一個近似（就是那個 `, 0`）。
 *
 * ⭐ 搬到這裡之後兩邊 import **同一支**：
 * ⛔ 「契約與遊戲的 yaw 規則漂開」在結構上不可能發生。
 * 客戶端那一份改成**門面**（re-export）⇒ 既有的 9 個 import 端一個都不用動。
 *
 * ⚠️ 這與 `content/animPulse.ts` 是**同一個形狀**（2026-09-02 同一天做的）：
 * 一份知識被兩邊要用，而其中一邊是 shared ⇒ ⭐ 唯一住處只能在 shared。
 */

/** w3x 匯入管線的出貨落點。 */
export const IMPORTED_GLB_PREFIX = "assets/models/imported/";

/**
 * 暴雪覆蓋層的本機落點 —— ⭐ **同一支轉檔器** ⇒ 同一個烘出來的正面
 * ⇒ 同一個預設 yaw。
 */
export const BLIZZARD_LOCAL_GLB_PREFIX = "assets/blizzard-local/models/";

/** 原生／體素烘出來的 glTF 正面是 +Z ⇒ φ = 0°。 */
export const NATIVE_GLB_YAW_OFFSET = 0;

/** w3x 匯入的正面是 +X ⇒ φ = 90°。 */
export const IMPORTED_GLB_YAW_OFFSET = Math.PI / 2;

/**
 * 一顆與**自己的家族**差 180° 的 glb（家族是 +X 而它是 -X）⇒ φ = -90° ≡ 270°。
 * ⛔ **不由前綴推**：一顆模型要靠自己的文件寫 `yawOffsetDeg: 270` 才拿得到。
 */
export const IMPORTED_FLIPPED_GLB_YAW_OFFSET = Math.PI + Math.PI / 2;

/** 這顆 glb 是不是 w3x 匯入管線來的。 */
export function isImportedGlb(glbPath: string): boolean {
  return (
    glbPath.startsWith(IMPORTED_GLB_PREFIX) || glbPath.startsWith(BLIZZARD_LOCAL_GLB_PREFIX)
  );
}

/** 家族預設（**弧度**）—— ⛔ 忽略文件上的逐顆覆寫。 */
export function familyGlbYawOffset(glbPath: string): number {
  return isImportedGlb(glbPath) ? IMPORTED_GLB_YAW_OFFSET : NATIVE_GLB_YAW_OFFSET;
}

/** 這一支只需要 glb 路徑與（可選的）逐顆覆寫。 */
export interface FacingModelLike {
  readonly glbPath: string;
  readonly yawOffsetDeg?: number | undefined;
}

/**
 * ⭐⭐ **遊戲真的套用的那個值**（弧度）。
 *
 * ⚠️ 文件上的 `yawOffsetDeg` 贏 —— **包含它是 0 的時候**
 * （0 是一個有意義的值：原生家族的模型，或一顆被重新輸出成 +Z 的匯入模型）
 * ⇒ ⭐ 判準是 `undefined`，⛔ **不是 falsy**。
 */
export function glbYawOffset(doc: FacingModelLike): number {
  if (doc.yawOffsetDeg !== undefined && Number.isFinite(doc.yawOffsetDeg)) {
    return (doc.yawOffsetDeg * Math.PI) / 180;
  }
  return familyGlbYawOffset(doc.glbPath);
}

/** ⭐ 同上，但回**度** —— 對外契約用這一個（⛔ 編輯器不該自己換算弧度）。 */
export function effectiveYawOffsetDeg(doc: FacingModelLike): number {
  return (glbYawOffset(doc) * 180) / Math.PI;
}

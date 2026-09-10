import type { ResizeImage } from "@ggd/shared/content/modelUpload/normalize";

/**
 * 瀏覽器 worker 的縮圖器 —— ⭐ `createImageBitmap` + `OffscreenCanvas`，兩個在 worker 裡都有。
 *
 * > owner 2026-09-10（逐字）：「這個應該變成**上架前 後台＆編輯器的內建 script** 吧
 * >  避免上架到過大的貼圖」
 *
 * ⛔ 回 `null` 就是「縮不動」，⛔ 不是「不用縮」—— 呼叫端會把它記進
 * `texturesOverCap`，而預算閘會擋下來。
 */
export const resizeImageInBrowser: ResizeImage = async (bytes, maxEdge) => {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return null;
  try {
    // ⚠️ `bytes` 可能是一段更大 buffer 的 view ⇒ 一定要切出自己的那一段再包 Blob。
    const bitmap = await createImageBitmap(new Blob([bytes.slice()]));
    const scale = maxEdge / Math.max(bitmap.width, bitmap.height);
    if (scale >= 1) { bitmap.close(); return null; }
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return null; }
    // ⭐ 高品質縮放 —— ⛔ 預設的 nearest 會讓角色貼圖出現鋸齒色塊。
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    // ⛔ 一律輸出 PNG：來源可能帶 alpha，而 JPEG 沒有 alpha。
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
};

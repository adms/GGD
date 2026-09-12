import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResizeImage } from "@ggd/shared/content/modelUpload/normalize";

/**
 * Node 端的縮圖器 —— ⭐ 走 **ffmpeg**。
 *
 * > owner 2026-09-10（逐字）：「**後台設定跟編輯器都要自動帶入這個檢查與修正 script**」
 *
 * ⚠️ 為什麼不是 canvas：Node 沒有 `createImageBitmap` 也沒有 `OffscreenCanvas`
 * （2026-09-10 實測兩個都是 undefined）。⚠️ 為什麼不是 sharp：這個 workspace 沒有它，
 * ⛔ 而為了縮圖去裝一個原生相依會動到 lockfile（併行工作流會撞）。
 * ⭐ ffmpeg 是 `tools/model-budget/optimize.ts` 的貼圖階段**已經依賴**的東西。
 *
 * ⛔ 找不到 ffmpeg 時回 `null`（⛔ 不擲例外）—— 呼叫端會把那張貼圖記進
 * `texturesOverCap`，而預算閘擋得住它。⚠️ fail-open 沒錯，**靜默**才是缺陷。
 */
export const resizeImageWithFfmpeg: ResizeImage = async (bytes, maxEdge) => {
  const dir = mkdtempSync(join(tmpdir(), "ggd-tex-"));
  try {
    const src = join(dir, "in.png"), out = join(dir, "out.png");
    writeFileSync(src, bytes);
    execFileSync("ffmpeg", [
      "-v", "error", "-y", "-i", src,
      // ⭐ 等比縮到最長邊 = maxEdge，⛔ 不放大（`min(iw,N)` 讓小圖原樣通過）
      // PNGs without density metadata otherwise inherit SAR=0/1, which is invalid for glTF textures.
      "-vf", `scale='if(gt(iw,ih),min(iw,${maxEdge}),-2)':'if(gt(iw,ih),-2,min(ih,${maxEdge}))':flags=lanczos,setsar=1`,
      out,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    return new Uint8Array(readFileSync(out));
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

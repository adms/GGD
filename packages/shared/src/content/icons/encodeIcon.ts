/**
 * ⭐⭐ GH#966 —— **icon 轉檔規則的唯一住處**（第〇·四守則）。
 *
 * ── ⛔ 在此之前 ────────────────────────────────────────────────────────────
 * 128² · q90 · `cwebp` 這三件事只住在 `tools/icon-gen/convert-webp.mjs` 裡，
 * ⭐ 而 #966 要讓 **content-api 也轉一次同樣的檔**。
 * ⇒ ⛔ 抄第二份的症狀是「**編輯器預覽看到的圖 ≠ 遊戲裡的圖**」，
 *   ⚠️ 而**沒有任何東西會紅** —— 兩邊各自都跑得起來。
 * ⇒ ⭐ 所以 CLI 與 API **import 同一支**，改 quality 兩邊一起變。
 *
 * ── ⭐ 這一支刻意**不**引入任何影像函式庫 ──────────────────────────────────
 * `sniffImageHeader()` 只讀**檔頭**（PNG 的 IHDR／WebP 的 VP8 chunk／JPEG 的 SOFn），
 * ⛔ 一個像素都不解碼。理由是安全，⛔ 不是效能：
 *
 * ⚠️ ⭐ **圖片解壓炸彈** —— 一張宣稱 65535×65535 的 PNG 檔頭只有 24 bytes，
 * 壓縮後可能只有幾 KB（`checkZipSafety` 的壓縮比、entry 大小**全部過**），
 * ⛔ 而 `cwebp` 真的去 decode 它就是 12 GB 的記憶體。
 * ⇒ ⭐ 判準必須在 **decode 之前**問「你的檔頭說你有多大」，
 *   ⛔ 而不是「解開來看看多大」。
 *
 * ⚠️ 這與 zip bomb 是**不同的威脅面**：zip 那一層量的是**位元組**，
 * 這一層量的是**像素**。⛔ 一層擋不到另一層。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ICON_ENCODE } from "./iconContract";

export * from "./iconContract";

/**
 * ⭐ 出貨的 icon 規格。**這是唯一住處** —— `tools/icon-gen/convert-webp.ts` 與
 * `apps/content-api` 都 import 它。
 *
 * ⚠️ 128 的出處是量到的，⛔ 不是挑的：全 app 顯示 icon 最大的地方是登入跑馬燈的
 * 頭像 **54 CSS px**（DPR 2 ⇒ 108 device px）⇒ 128² 在每一個使用點都還是過取樣。
 */
export interface EncodeIconOptions {
  readonly edge?: number;
  readonly quality?: number;
  /**
   * ⭐ 保留透明背景（`cwebp` 的**預設行為**）。
   * ⚠️ 剝掉 alpha 會讓設計師做不出舊 w3x 那種去背風格 —— 出貨 119 份 legacy PNG
   * 正是靠 alpha 疊在技能格上。⇒ 預設 `true`。
   */
  readonly preserveAlpha?: boolean;
  /** 測試注入用；預設真的跑 `cwebp`。 */
  readonly run?: (args: readonly string[]) => void;
}

export class IconEncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IconEncodeError";
  }
}

/**
 * ⭐⭐ 一張來源圖 → 出貨規格的 WebP 位元組。
 *
 * ⚠️ ⭐ 呼叫端**必須**先跑 `sniffImageHeader()` 並自己擋掉超大尺寸 ——
 * ⛔ 這一支不做那件事，因為它已經在 decode 那一側了（見檔頭的解壓炸彈那一段）。
 * ⭐ 判準：`encodeIcon` 是**執行者**，`sniffImageHeader` 是**守門員**，
 * ⛔ 把守門併進執行者會讓「先驗後解」這個順序變成一句註解。
 */
export function encodeIcon(input: Uint8Array, opts: EncodeIconOptions = {}): Buffer {
  const edge = opts.edge ?? ICON_ENCODE.edge;
  const quality = opts.quality ?? ICON_ENCODE.quality;
  const run =
    opts.run ??
    ((args: readonly string[]): void => {
      execFileSync("cwebp", [...args], { stdio: "pipe" });
    });
  const dir = mkdtempSync(join(tmpdir(), "ggd-icon-"));
  const src = join(dir, "in");
  const out = join(dir, "out.webp");
  try {
    writeFileSync(src, input);
    const args = [
      "-quiet",
      "-q",
      String(quality),
      "-resize",
      String(edge),
      String(edge),
      ...(opts.preserveAlpha === false ? ["-noalpha"] : []),
      src,
      "-o",
      out,
    ];
    try {
      run(args);
    } catch (e) {
      throw new IconEncodeError(
        `cwebp 轉檔失敗（${args.join(" ")}）：${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

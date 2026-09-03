/**
 * ⭐⭐ GH#966 —— **真的去跑 `cwebp` 的那一支**（Node 專用）。
 *
 * ⚠️ ⭐ 它從 `encodeIcon.ts` 切出來，理由逐字寫在那一支的檔尾：
 * 那個檔被 `schema/config/iconUpload.ts` 讀，⭐ 而 config schema **客戶端會載入**
 * ⇒ 任何 `node:` import 都會讓瀏覽器在首次繪製時擲例外（2026-09-04 實測，
 * ⛔ 連真的遊戲客戶端一起壞）。
 *
 * ⇒ ⭐ 這裡是**唯一**允許碰 `node:child_process` / `node:fs` 的那一半。
 * ⛔ 消費端只有 content-api（`iconLanding.ts`）與產生器（`tools/icon-gen`）。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ICON_ENCODE, IconEncodeError } from "./encodeIcon";
import type { EncodeIconOptions } from "./encodeIcon";

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

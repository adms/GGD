/**
 * `apps/ packages/ tools/` 的原始碼**一顆原始 NUL 位元組都不可以有**（GH#1032）。
 *
 * ⭐ 為什麼：一顆 0x00 就讓 `grep`／`file` 把整檔當 **binary 靜默跳過** ——
 *   `grep -rn <關鍵字>` 對它**永遠零命中**，而零命中讀起來跟「真的沒有」一模一樣
 *   （macOS `grep -r` 連「Binary file matches」都不印）。GH#996 的假前提
 *   「`cover("ping-band-gutter")` 全 repo 零命中」就是這樣量出來的：呼叫一直在，
 *   那一檔有 2 顆 NUL 當 Map key 分隔符。⇒ 修法是寫**跳脫** `"\0"`（執行期逐位元相同）。
 *
 * ⭐ 從檔案系統走，⛔ 不是白名單：只跳過相依／venv／產物目錄。`build` 刻意不跳 ——
 *   `src/build/` 是原始碼（GH#1038）。KNOWN 是棘輪（今天空的），加一列要帶理由。
 * ⭐ 兩個方向都校準：先塞一份必含 NUL 的 sentinel，掃描器抓得到它才算量尺沒瞎。
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ROOTS = ["apps", "packages", "tools"];
const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs|go|py|sh)$/;
/** 只跳「不是我們寫的」與「機器寫的」：相依 · venv · 產物 · 整樹快照。 */
const SKIP_DIR = /^(node_modules|\.venv|venv|__pycache__|\.git|dist|coverage|out)$|^(\.backup|backup-)/;
/** 棘輪：路徑 → 為什麼這一份**非得**含原始 NUL（一個能被反駁的理由）。今天是空的。 */
const KNOWN: Record<string, string> = {};

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) yield* walk(join(dir, e.name)); }
    else if (e.isFile() && SOURCE.test(e.name)) yield join(dir, e.name);
  }
}
const nulCount = (f: string): number => readFileSync(f).filter((x) => x === 0).length;

function scan(roots: string[]): { scanned: number; hits: { file: string; nul: number }[] } {
  const hits: { file: string; nul: number }[] = [];
  let scanned = 0;
  for (const root of roots) for (const f of walk(root)) {
    scanned++;
    if (readFileSync(f).includes(0)) hits.push({ file: f, nul: nulCount(f) });
  }
  return { scanned, hits };
}

describe("原始碼不可以含原始 NUL 位元組（GH#1032）", () => {
  it("量尺先自證：塞了原始 NUL 的 .ts 掃得到、寫跳脫的掃不到", () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-nul-"));
    try {
      writeFileSync(join(dir, "clean.ts"), "export const k = 'a\\0b';\n"); // 跳脫 ⇒ 文字檔
      writeFileSync(join(dir, "dirty.ts"), Buffer.from("export const k = 'a\0b';\n")); // 原始位元組
      const { scanned, hits } = scan([dir]);
      expect(scanned).toBe(2);
      expect(hits.map((h) => `${relative(dir, h.file)}:${h.nul}`)).toEqual(["dirty.ts:1"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("apps/ packages/ tools/：含原始 NUL 的原始碼 ⇒ 紅並指名（棘輪只能變短）", () => {
    const { scanned, hits } = scan(ROOTS.map((r) => join(REPO, r)));
    expect(scanned).toBeGreaterThan(1000); // 非空母體：掃到的是真的樹，⛔ 不是一個空目錄
    const stray = hits
      .map((h) => ({ rel: relative(REPO, h.file), nul: h.nul }))
      .filter((h) => !(h.rel in KNOWN))
      .map((h) => `${h.rel}  (${h.nul} 顆 NUL)`);
    expect(stray, `含原始 NUL 的原始碼 —— grep 對它整檔失明。改寫成跳脫 "\\0"：\n  ${stray.join("\n  ")}`)
      .toEqual([]);
    for (const k of Object.keys(KNOWN))
      expect(nulCount(join(REPO, k)), `${k} 已經乾淨了 —— 從 KNOWN 拿掉（棘輪）`).toBeGreaterThan(0);
  });
});

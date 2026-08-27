/**
 * 出貨的 content/bundle.json 必須是最新的 —— 2026-08-01 線上斷線的守衛。
 *
 * ⚠️ 這一條看起來跟 `bundle.test.ts` 重複，它不是。兩者問的問題正好互補：
 *
 *   bundle.test.ts        「打包器正確嗎？」   在 cpSync 出來的 temp 樹上重建再驗。
 *   這一檔                「出貨的那一份最新嗎？」比對 repo 裡被 commit 的那個檔。
 *
 * bundle.test.ts 的檔頭把解耦寫成一件好事：「makes the suite independent of
 * whether anyone has run `pnpm content:build`」。那個理由是對的（乾淨 clone 不該
 * 因為沒人跑過 build 就紅），但沒有人補上互補的另一半，於是出現這個洞：
 *
 * **一份過期的 bundle.json 可以帶著全綠的測試被 push 出去。**
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 事故（4af1b5c1，2026-08-01）
 *
 * 那次 commit 同時改了原始檔與 Zod schema，但沒有把 `pnpm content:build` 的輸出
 * 一起放進去。客戶端抓的是 bundle.json 不是原始檔，所以線上收到的是舊形狀：
 *
 *   config/body-scale    bundle: attackRangeCoefficient / minScale / maxScale
 *                        schema: attackRangeCurve
 *   config/damage-colors bundle 沒有 outline，schema 要 outline
 *
 * → ContentLoader 驗證失敗 → main.tsx 的 fail-open 退回 sela/thorne 骨架（2 隻）
 * → 白名單那 63 隻一隻都不在骨架裡 → **選人畫面整個空的，玩家完全無法進場**。
 *
 * 而且過期的 bundle 還宣稱 `contentVersion: cv_ab2e86592ecc`，真實文件雜湊是
 * `cv_29b861e3f193` —— 版本號本身也是假的，所以快取鍵看起來甚至「換過了」，
 * 從外面完全看不出它是舊的。
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 這條紅了要做什麼
 *
 *     pnpm content:build && git add content/
 *
 * 不要改這個測試。它紅代表 repo 裡的出貨產物與原始檔對不上，而客戶端讀的是產物。
 */
import { describe, it, expect, afterAll } from "vitest";
import { unlockSandbox } from "../ops/writeProduct";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundlePath, rebuildAllIndexes, hashAssetTree,} from "./node/fsStore";
import { COLLECTION_NAMES } from "./schema/index";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/**
 * A throwaway rebuild of the SOURCE docs exactly as `pnpm content:build` would
 * produce it. Only the source collections + manifest are copied — the shipped
 * `bundle.json` and `_index.json` files are deliberately NOT copied in, so the
 * rebuild cannot be contaminated by the very artifacts under test.
 */
let freshTree: string | null = null;
function rebuiltFromSources(): string {
  if (freshTree !== null) return freshTree;
  const t = mkdtempSync(join(tmpdir(), "ggd-shipped-bundle-"));
  for (const name of COLLECTION_NAMES) {
    const src = join(CONTENT_DIR, name);
    if (existsSync(src)) {
      cpSync(src, join(t, name), { recursive: true });
      unlockSandbox(join(t, name)); // 🔒 cpSync 保留 444;沙盒本來就該可寫
    }
  }
  cpSync(join(CONTENT_DIR, "manifest.json"), join(t, "manifest.json"));
  unlockSandbox(t);
  // ⭐ GH#838 —— 同 bundle.test.ts：這棵重建樹**刻意不複製** content/assets，
  //    而 contentVersion 現在含資產摘要 ⇒ 要把**真樹**的那一格傳進來，
  //    ⛔ 否則「重建的 cv」會與出貨的差一格，而那個差異看起來像「bundle 過期」。
  rebuildAllIndexes(t, { assetsHash: hashAssetTree(join(CONTENT_DIR, "assets")) });
  freshTree = t;
  return t;
}

afterAll(() => {
  if (freshTree !== null) rmSync(freshTree, { recursive: true, force: true });
  freshTree = null;
});

interface BundleShape {
  contentVersion: string;
  collections: Record<string, { entries: Array<{ id: string; hash: string }> }>;
}

function readBundle(dir: string): BundleShape {
  return JSON.parse(readFileSync(bundlePath(dir), "utf8")) as BundleShape;
}

/**
 * Name the docs that actually differ, so the failure says WHICH content is
 * stale instead of "two big strings are not equal". A byte-diff on a 1.8 MB
 * one-line JSON is unreadable, and an unreadable failure is one people
 * "fix" by deleting the test.
 */
function driftedDocs(shipped: BundleShape, fresh: BundleShape): string[] {
  const out: string[] = [];
  const names = [
    ...new Set([...Object.keys(shipped.collections), ...Object.keys(fresh.collections)]),
  ].sort();
  for (const name of names) {
    const s = new Map((shipped.collections[name]?.entries ?? []).map((e) => [e.id, e.hash]));
    const f = new Map((fresh.collections[name]?.entries ?? []).map((e) => [e.id, e.hash]));
    for (const [id, hash] of [...f].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (!s.has(id)) out.push(`${name}/${id}: 出貨的 bundle 裡沒有這一份（新文件沒被打包）`);
      else if (s.get(id) !== hash) out.push(`${name}/${id}: 內容變了但 bundle 還是舊的`);
    }
    for (const id of [...s.keys()].sort()) {
      if (!f.has(id)) out.push(`${name}/${id}: 原始檔已刪除，但 bundle 還留著`);
    }
  }
  return out;
}

describe("出貨的 content/bundle.json 必須是最新的", () => {
  it("★ 每一份文件的雜湊都跟原始檔重建的結果一致（否則玩家收到舊內容）", () => {
    const shipped = readBundle(CONTENT_DIR);
    const fresh = readBundle(rebuiltFromSources());
    const drift = driftedDocs(shipped, fresh);
    expect(
      drift,
      `content/bundle.json 與 content/ 的原始檔對不上 —— 客戶端讀的是 bundle，` +
        `所以線上會收到舊內容。修法：\n\n    pnpm content:build && git add content/\n\n` +
        `對不上的文件（${drift.length} 份）：\n  · ${drift.slice(0, 25).join("\n  · ")}`,
    ).toEqual([]);
  });

  it("★ bundle 宣稱的 contentVersion 不是編出來的 —— 過期 bundle 會帶著一個假版本號", () => {
    // 這一條抓的是事故裡最陰險的部分：過期的 bundle 宣稱 cv_ab2e86592ecc，而真實
    // 文件雜湊是 cv_29b861e3f193。版本號有變 ⇒ 快取鍵有變 ⇒ 從外面看它像是新的。
    expect(readBundle(CONTENT_DIR).contentVersion).toBe(
      readBundle(rebuiltFromSources()).contentVersion,
    );
  });

  it("★ 出貨的 bundle 位元組等於重建的 —— 連 gzip/brotli 的快取鍵都不能漂移", () => {
    // 上面兩條讀的是解析後的結構；這一條讀原始位元組，擋住「雜湊都對但序列化順序
    // 變了」那一類 —— 那會讓 CDN 快取鍵無聲地失效。
    //
    // ⚠️ 刻意不寫 `expect(a).toBe(b)`：bundle 是 1.8 MB 的單行 JSON，直接比對會讓
    // vitest 把兩份全文都傾印出來（實測 3.6 MB 的失敗輸出）。一個沒人讀得完的失敗
    // 訊息，下一個人的處理方式就是刪掉這條測試。所以這裡只報「差在哪、差多少」。
    const a = readFileSync(bundlePath(CONTENT_DIR), "utf8");
    const b = readFileSync(bundlePath(rebuiltFromSources()), "utf8");
    if (a === b) return;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    expect.fail(
      `content/bundle.json 的位元組與重建的不一致 —— 跑 pnpm content:build。\n` +
        `  出貨 ${a.length} B / 重建 ${b.length} B，第一個差異在 offset ${i}\n` +
        `  出貨: …${a.slice(Math.max(0, i - 40), i + 40)}…\n` +
        `  重建: …${b.slice(Math.max(0, i - 40), i + 40)}…`,
    );
  });

  it("★ 每一個 _index.json 與 manifest.json 也都是最新的（伺服器讀的是這些）", () => {
    // 客戶端走 bundle，但 game-server 開機走 FsContentSource → manifest + 各集合
    // 的 _index.json。只守 bundle 會漏掉「客戶端對、伺服器錯」那一半。
    const fresh = rebuiltFromSources();
    const stale: string[] = [];
    for (const rel of ["manifest.json", ...COLLECTION_NAMES.map((n) => `${n}/_index.json`)]) {
      const a = join(CONTENT_DIR, rel);
      const b = join(fresh, rel);
      if (!existsSync(b)) continue;
      if (!existsSync(a)) stale.push(`${rel}: 出貨樹裡沒有這個檔`);
      else if (readFileSync(a, "utf8") !== readFileSync(b, "utf8")) stale.push(rel);
    }
    expect(stale, `這些索引過期了，跑 pnpm content:build：\n  · ${stale.join("\n  · ")}`).toEqual(
      [],
    );
  });
});

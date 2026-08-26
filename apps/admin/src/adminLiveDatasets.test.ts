/**
 * 🔴 LIVE dataset 們真的 build 得起來（GH#775）—— 體驗層薄守衛。
 *
 * 「script 實時動態產生」（owner 2026-08-26 逐字）的最低保證：每一個
 * `tools/admin-live/datasets/*.mjs` 在**現在的 repo 狀態**下 build() 一次
 * 不擲例外、回得出非空物件、而且宣告了誠實的 deps（空 deps = 永遠吃快取
 * = 變回靜態內容）。
 *
 * ── 突變紀錄（一批一條）：把 middleware 的 depsKey 改成回傳常數 ⇒ 第③條紅
 *（快取鍵不再隨 deps 變）。（實際突變做在 review 時；這裡的三條是行為斷言。）
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const DIR = join(REPO, "tools/admin-live/datasets");
const names = readdirSync(DIR).filter((f) => f.endsWith(".mjs") && !f.startsWith("_"));

describe("admin-live datasets (GH#775)", () => {
  it("⭐ 每一個 dataset build() 都跑得動、回非空物件、deps 非空", { timeout: 120_000 }, async () => {
    expect(names.length, "一個 dataset 都沒有 —— 13 頁全空").toBeGreaterThanOrEqual(13);
    const bad: string[] = [];
    for (const f of names) {
      try {
        const m = (await import(pathToFileURL(join(DIR, f)).href)) as {
          build?: (root: string) => Promise<unknown>;
          deps?: string[] | ((root: string) => string[]);
        };
        if (typeof m.build !== "function") { bad.push(`${f}: 沒有 export build()`); continue; }
        const deps = typeof m.deps === "function" ? m.deps(REPO) : m.deps;
        if (!deps || deps.length === 0) bad.push(`${f}: deps 是空的 —— 永遠吃快取 = 變回靜態內容`);
        const out = (await m.build(REPO)) as Record<string, unknown>;
        if (!out || typeof out !== "object" || Object.keys(out).length === 0)
          bad.push(`${f}: build() 回了空物件`);
      } catch (err) {
        bad.push(`${f}: ${String(err).slice(0, 160)}`);
      }
    }
    expect(bad.join("\n"), "⛔ 這些 dataset 在現在的 repo 狀態下壞了（頁面會畫錯誤訊息）").toBe("");
  });
});

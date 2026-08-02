/**
 * 出貨的 bundle 只能由**被 commit 的**原始檔建出來 —— 2026-08-02 第二次線上斷線的守衛。
 *
 * ⚠️ 這一條與旁邊兩支不重複，三者問的是三個不同的問題：
 *
 *   bundle.test.ts                  「打包器正確嗎？」    在 cpSync 的 temp 樹上重建再驗
 *   shippedBundleIsCurrent.test.ts  「出貨的那份最新嗎？」 比對 repo 裡被 commit 的產物
 *   這一檔                          「它的來源都進版控了嗎？」比對 `git ls-files`
 *
 * 前兩支都是**在工作區裡**問問題，而工作區同時看得到已追蹤與未追蹤的檔案。
 * 所以下面這條路徑對它們兩個而言完全是綠的：
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 事故（bb07f0e9 → v0.9.26，2026-08-02，同一天內第二次同型故障）
 *
 * 三個新的 config 原始檔（`lobby-layout` / `valhalla-sandbox` / `victory-podium`）
 * 存在於工作區但**沒有被 commit**。`pnpm content:build` 照樣讀得到它們，於是把
 * 三份文件**內嵌進 bundle.json**、把三筆 path 寫進 `config/_index.json`，
 * 而那兩個**產物**被 commit 了。結果：
 *
 *   repo 裡的 bundle.json  → 含 config.lobby-layout@1 / valhalla-sandbox@1 / victory-podium@1
 *   repo 裡的 schema       → 完全不認得這三個 tag（config.ts 的改動也沒 commit）
 *   repo 裡的原始檔        → 不存在
 *
 * 客戶端讀的是 bundle.json → Zod discriminated union 拒絕三份未知 tag →
 * ContentLoader **整份**失敗 → `main.tsx` fail-open 退回 sela/thorne 骨架（2 隻）
 * → 選人畫面全空、無人能進場。與前一天 4af1b5c1 完全同型。
 *
 * ⚠️ 而且部署的四項後置條件全綠：`bundle.json` 的英雄數是對的（119），
 * 壞掉的是**三份 config**，英雄一隻都沒少。
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 為什麼守衛是「比對 git」而不是「比對硬碟」
 *
 * 因為缺陷的本體就是「硬碟上有、git 裡沒有」。任何只讀硬碟的檢查在它面前
 * 必然是綠的 —— 這正是 CLAUDE.md 失敗形態 ⑤ 的一種：**被測的不是出貨的那個**。
 * 出貨的是 git（部署走 `git pull`），不是某台機器的工作區。
 *
 * 這條紅了要做什麼：把它列出來的那些檔 `git add` 進去，然後
 * `pnpm content:build && git add content/`。不要改這個測試。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLLECTION_NAMES } from "./schema/index";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const CONTENT = join(REPO, "content");

/**
 * `git ls-files content` 的結果，正規化成 repo 相對路徑的集合。
 *
 * 回傳 null = 這棵樹沒有 .git（例如從 source tarball 解出來的），此時這個檢查
 * 沒有意義也無從進行 —— 明說跳過，不要假裝綠。
 */
function trackedContentFiles(): Set<string> | null {
  if (!existsSync(join(REPO, ".git"))) return null;
  const out = execFileSync("git", ["ls-files", "content"], { cwd: REPO, encoding: "utf8" });
  return new Set(out.split("\n").filter((l) => l.length > 0));
}

describe("出貨的 bundle 只能由被 commit 的原始檔建出來", () => {
  it("每一份 _index.json 指名的 path 都在 git ls-files 裡", () => {
    const tracked = trackedContentFiles();
    if (tracked === null) {
      // 沒有 .git 就沒有「已追蹤」這個概念。這是唯一合法的跳過理由。
      expect(existsSync(join(REPO, ".git"))).toBe(false);
      return;
    }

    const missing: string[] = [];
    for (const collection of COLLECTION_NAMES) {
      const indexPath = join(CONTENT, collection, "_index.json");
      if (!existsSync(indexPath)) continue;
      const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
        entries?: { id: string; path: string }[];
      };
      for (const entry of index.entries ?? []) {
        const repoRelative = `content/${entry.path}`;
        if (!tracked.has(repoRelative)) missing.push(`${collection}/${entry.id} → ${repoRelative}`);
      }
    }

    expect(
      missing,
      `這些文件被索引進出貨產物,但它們的原始檔沒有被 commit —— ` +
        `部署走 git pull,所以線上會拿到「bundle 裡有、原始檔與 schema 卻沒有」的組合,` +
        `客戶端整份內容載入失敗退回骨架:\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("bundle.json 內嵌的每一份文件,其 id 都能在同集合的 _index.json 找到", () => {
    // 互補的另一半:上一條從 index 出發,這一條從 bundle 出發。
    // bundle 才是客戶端真正讀的東西,而它與 index 是兩個獨立寫出的產物。
    const bundle = JSON.parse(readFileSync(join(CONTENT, "bundle.json"), "utf8")) as {
      collections: Record<string, { entries: { id: string }[] }>;
    };
    const orphans: string[] = [];
    for (const [collection, block] of Object.entries(bundle.collections).sort((a, b) =>
      a[0] < b[0] ? -1 : 1,
    )) {
      const indexPath = join(CONTENT, collection, "_index.json");
      if (!existsSync(indexPath)) {
        orphans.push(`${collection}/* → 整個集合沒有 _index.json`);
        continue;
      }
      const index = JSON.parse(readFileSync(indexPath, "utf8")) as { entries?: { id: string }[] };
      const ids = new Set((index.entries ?? []).map((e) => e.id));
      for (const entry of block.entries) {
        if (!ids.has(entry.id)) orphans.push(`${collection}/${entry.id}`);
      }
    }
    expect(orphans, `bundle.json 內嵌了索引裡沒有的文件:\n  ${orphans.join("\n  ")}`).toEqual([]);
  });
});

/**
 * GH#838 —— **資產位元組必須參與 `contentVersion`** 的守衛。
 *
 * owner 2026-08-28：「Rider EX 地上魔法陣沒有去背透明，你已經不是第一次沒去背
 * 乾淨，請深入檢討根因改善」。
 *
 * ⭐ 根因**不是漏了哪一張圖** —— 那張圖 2026-08-24（`a9cf7187`）就修好了。
 * 根因是**交付**：客戶端用 `?h=<contentVersion>` 抓每一顆 glb，而 nginx 對非空
 * `?h=` 給 `max-age=31536000, immutable`。而 `contentVersion` 在修好之前
 * **只由 JSON 文件推導** ⇒ 一次「只改 glb、零份文件」的修復產生**一模一樣的 cv**
 * ⇒ 修好的資產用**跟壞掉那份完全相同的 URL** 出貨 ⇒ 看過壞版本的瀏覽器鎖它一年。
 *
 * ⇒ ⭐⭐ **「修好了」與「玩家看得到」之間有一段路，而那一段以前沒有任何閘。**
 * 這一支就是那道閘：改一個位元組的資產 ⇒ cv 一定要變。
 *
 * 突變驗證（2026-08-28）：把 `rebuildManifest` 裡的 `hashes["__assets"]` 那一行
 * 拿掉 ⇒ ①② 紅。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashAssetTree, rebuildManifest, shippingAssetFiles } from "./fsStore";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");

function tree(): string {
  const root = mkdtempSync(join(tmpdir(), "ggd-assets-"));
  mkdirSync(join(root, "assets", "models", "imported"), { recursive: true });
  writeFileSync(join(root, "assets", "models", "imported", "a.glb"), "AAAA");
  writeFileSync(join(root, "assets", "models", "imported", "b.glb"), "BBBB");
  return root;
}

describe("GH#838 資產位元組進 contentVersion", () => {
  it("① 改一顆 glb 的位元組 ⇒ manifest 的 contentVersion 一定會變（⛔ 不然修好的資產被快取鎖住）", () => {
    const root = tree();
    try {
      const before = rebuildManifest(root, { write: false }).contentVersion;
      writeFileSync(join(root, "assets", "models", "imported", "a.glb"), "AAAB"); // 一個位元組
      const after = rebuildManifest(root, { write: false }).contentVersion;
      expect(after, "改了資產位元組而 cv 沒變 —— 修好的東西會用壞掉那份的 URL 出貨").not.toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("② 新增／刪除一顆資產也算（⛔ 不是只有改內容）", () => {
    const root = tree();
    try {
      const before = rebuildManifest(root, { write: false }).contentVersion;
      writeFileSync(join(root, "assets", "models", "imported", "c.glb"), "CCCC");
      expect(rebuildManifest(root, { write: false }).contentVersion).not.toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("③ 決定性：內容沒變就算重跑一百次也是同一個 cv（⛔ 不吃 mtime —— 否則每次 CI 都 bust 全世界的快取）", () => {
    const root = tree();
    try {
      const a = rebuildManifest(root, { write: false }).contentVersion;
      const b = rebuildManifest(root, { write: false }).contentVersion;
      expect(a).toBe(b);
      expect(hashAssetTree(join(root, "assets"))).toBe(hashAssetTree(join(root, "assets")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("④ 沒有 assets 目錄 ⇒ 不加那一格（舊行為逐位元不變）", () => {
    const root = mkdtempSync(join(tmpdir(), "ggd-noassets-"));
    try {
      expect(hashAssetTree(join(root, "assets"))).toBeUndefined();
      expect(() => rebuildManifest(root, { write: false })).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * ⭐⭐ GH#979 —— cv 必須**跨機器**相同，而它在 2026-09-05 之前不是：
   * `hashAssetTree` 走磁碟，於是 owner 機器上 5,050 個 `.gitignore` 掉的語音副產物
   * 進了 `contentVersion` ⇒ 同一份出貨內容，本機 `cv_ea619986d5b8` / CI
   * `cv_f97908667d9b` ⇒ `shippedBundleIsCurrent`／`bundle.test.ts` 在 CI 上必紅，
   * ⛔ 而訊息說「跑 content:build」——跑一百次也不會綠。
   *
   * ⚠️ 修法把規則寫成 `isNonShippingAsset`，⇒ 它與 `.gitignore` 是**兩個住處**，
   * 會漂。這一條就是那道閘，而且**兩個方向一起問**（失敗形態⑫）：
   *   · 我們雜湊了 git 追蹤不到的檔 ⇒ 紅（＝下一台機器又會算出別的 cv）
   *   · git 追蹤的檔我們沒雜湊     ⇒ 紅（＝改了它 cv 不動，快取把壞的鎖住）
   *
   * 突變驗證（2026-09-05）：`isNonShippingAsset` 直接 `return false`
   * ⇒ 這一條紅並列出 5,050 個多算的檔。
   */
  it("⑤ 雜湊的母體 == git 追蹤的母體 —— ⛔ 兩個方向都問（cv 必須跨機器相同）", () => {
    const assetsDir = join(REPO, "content/assets");
    if (!existsSync(assetsDir) || !existsSync(join(REPO, ".git"))) {
      // ⛔ 不靜默：一個「條件不成立就安靜通過」的閘與不存在的閘沒有差別。
      expect.fail(
        `⚠️ 沒驗到：${assetsDir} 或 ${join(REPO, ".git")} 不在 —— ` +
          "這條閘需要**真的 repo**（它比對的正是「磁碟」與「git」兩份母體）。",
      );
    }
    const hashed = new Set(shippingAssetFiles(assetsDir));
    const tracked = new Set(
      execFileSync("git", ["ls-files", "-z", "--", "content/assets"], {
        cwd: REPO,
        encoding: "utf8",
        maxBuffer: 1 << 28,
      })
        .split("\0")
        .filter(Boolean)
        .map((p) => p.slice("content/assets/".length))
        // git 記得已刪除但還沒 commit 的檔；母體比的是**磁碟上還在的**那些。
        .filter((rel) => existsSync(join(assetsDir, rel))),
    );
    expect(hashed.size, "一個資產都沒雜湊到 —— 這條閘在空轉").toBeGreaterThan(1000);
    const extra = [...hashed].filter((f) => !tracked.has(f));
    const missing = [...tracked].filter((f) => !hashed.has(f));
    expect(
      { 多算了: extra.length, 少算了: missing.length },
      "⛔ contentVersion 的母體與 git 追蹤的檔對不上 ⇒ 這台機器會算出跟別台不一樣的 cv。\n" +
        `  多算（雜湊了但 git 沒有，⇒ 乾淨 clone 會算出別的 cv）：\n    · ${extra.slice(0, 8).join("\n    · ") || "（無）"}\n` +
        `  少算（git 有但沒雜湊，⇒ 改了它 cv 不動、快取鎖住壞的）：\n    · ${missing.slice(0, 8).join("\n    · ") || "（無）"}\n` +
        "⭐ 修法：對照 `.gitignore` 調整 `isNonShippingAsset`（fsStore.ts），⛔ 不是改這條測試。",
    ).toEqual({ 多算了: 0, 少算了: 0 });
  });
});

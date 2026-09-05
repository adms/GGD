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
});

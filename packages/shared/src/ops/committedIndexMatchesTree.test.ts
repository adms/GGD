/**
 * ⭐ GH#1172 —— **索引指著同一個 commit 裡被刪掉的檔** ⇒ 正式站 502，而三條閘全綠。
 *
 * 2026-09-10：`60cf6f5f9` 一次 `git diff --name-only` 當 pathspec，掃進別條 lane 的
 * 9 個 skin 刪除，而 `content/skins/_index.json` 還指著它們 ⇒ platform 開機讀不到檔
 * ⇒ Restarting 迴圈 ⇒ nginx 解析不到 upstream ⇒ edge 退出 ⇒ **ggd.adms.ai 502**。
 * 既有三條閘全綠：`content:build` 照檔案系統重建（那一刻檔還在）；`shippedBundleIsCurrent`
 * 兩邊少了同樣的東西；`shippedBundleHasTrackedSources` 只從「索引」走且問的是工作區。
 * ⇒ 形態⑫（只驗一個方向）＋ 形態⑪（兩條對的閘組合是空的）。
 *
 * ⭐ 這一條只讀 git（`git archive HEAD content`），兩個方向都走。夾具是**真實的那個 commit**（⛔ 不是自己編一份 —— 形態⑤）。
 * MUTATION：把 `auditIndexes` 方向①的迴圈拿掉 ⇒ 夾具 `60cf6f5f9` 從紅變綠。
 */
import { describe, it, expect } from "vitest";
import { exportContentAt, hasGit, revExists } from "./gitTreeExport";
import { auditIndexes } from "./committedTreeAudit";

const SKIP = !hasGit();
const FIXTURE_RED = "60cf6f5f9";   // 2026-09-10 正式站 502 的那個 commit
const FIXTURE_GREEN = "60cf6f5f9^";

describe("GH#1172 committed _index.json ↔ committed tree（⭐ 只讀 git，兩個方向）", () => {
  it("HEAD：索引指名的每一條 path 都在樹裡（方向①，⛔ 缺了 = 部署後 502 那一類）", (ctx) => {
    if (SKIP) { console.warn("⚠️ 沒有 .git ⇒ 這條閘**沒驗到**（不是綠）"); ctx.skip(); return; }
    const a = auditIndexes(exportContentAt("HEAD"));
    expect(a.collections).toBeGreaterThan(0);
    expect(a.missingFromTree, "索引指著不存在的檔 —— platform 開機讀不到就會 Restarting 迴圈").toEqual([]);
  });

  it("HEAD：樹裡的每一份文件索引都有（方向②，⛔ 缺了 = 上架了而玩家拿不到）", (ctx) => {
    if (SKIP) { ctx.skip(); return; }
    const a = auditIndexes(exportContentAt("HEAD"));
    expect(a.missingFromIndex, "修法：pnpm content:build && git add content/").toEqual([]);
  });

  it(`★ 夾具 ${FIXTURE_RED}（真實的 502 commit）必須紅，而且逐字指名那 9 份 skin；它的父 commit 綠`, (ctx) => {
    if (SKIP || !revExists(FIXTURE_RED)) { console.warn(`⚠️ 夾具 ${FIXTURE_RED} 不在本機 ⇒ 量尺沒自證`); ctx.skip(); return; }
    const a = auditIndexes(exportContentAt(FIXTURE_RED));
    expect(a.missingFromTree.length).toBe(9);
    expect(a.missingFromTree.every((m) => m.startsWith("skins/skin."))).toBe(true);
    expect(auditIndexes(exportContentAt(FIXTURE_GREEN)).missingFromTree).toEqual([]);
  });
});

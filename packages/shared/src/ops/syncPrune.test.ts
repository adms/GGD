/**
 * ⭐ **`sync.mjs --since` 的裁剪，⛔ 不可以變成漏跑。**
 *
 * > owner 2026-08-23：「**為什麼我要全跑 skills 產生器，即使我沒有做技能更動
 * >  或小範圍更動也需要全跑嗎 可以用旗標註明是否有改動需要跑哪支就好？**」
 *
 * ⚠️ 這一條驗的是**三個關係**，⛔ 不是「有沒有 --since 這個字」：
 *   ① **裁掉的要標 `done`，⛔ 不是 `skipped`** —— 這是承重的那一格。
 *      標 skipped 會讓整條下游被當成「輸入是壞的」而一起跳過 ⇒ 那不是裁剪，是**漏跑**，
 *      而漏跑的產物會帶著全綠測試上線（2026-08-01：過期的 bundle ⇒ 選人畫面空掉）。
 *   ② **fail-closed 往「多跑」倒** —— 對不到輸入表就全跑。
 *   ③ **CJK 路徑要解得開** —— git 預設把它們印成 C 風格跳脫，對不到任何規則
 *      ⇒ 每一次純文件改動都會 fail-closed 成全跑（量到過）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { planFromPaths } from "../../../../tools/parallel-gates/syncPlan.mjs";

const REPO = join(__dirname, "../../../..");
const code = readFileSync(join(REPO, "tools/parallel-gates/sync.mjs"), "utf8");

describe("skills:sync 裁剪", () => {
  it("★ 裁掉的標 done ⛔ 不是 skipped（標錯 = 整條下游被漏跑）", () => {
    const at = code.indexOf("prune.has(i)");
    expect(at, "sync.mjs 沒有用 prune —— 裁剪計畫還沒接上執行").toBeGreaterThan(-1);
    // ⚠️ 視窗要**只框住這一個分支** —— 下一個分支（前置紅了 ⇒ skipped）本來就有
    //    `skipped.add(i)`，框太寬會誤報。以區塊的收尾 `}` 為界。
    const block = code.slice(at, at + code.slice(at).indexOf("\n  }") + 4);
    expect(
      /done\[i\] = true/.test(block),
      "裁掉的沒有標成 done —— 下游會拿不到它的輸出而被當成『輸入是壞的』一起跳過。",
    ).toBe(true);
    expect(
      /skipped\.add\(i\)/.test(block),
      "裁掉的被標成 skipped —— 那不是裁剪，是漏跑（過期產物 + 全綠測試 = 2026-08-01 的形狀）。",
    ).toBe(false);
  });

  it("② fail-closed：對不到輸入表就全跑", () => {
    // ⚠️ 要挑一個**在產生器宇宙裡**的 root（`content/`）而且對不到任何輸入表的路徑。
    //   ⛔ 完全在宇宙外的 root（例如 `some/`）不算 —— 那種路徑真的不可能讓任何
    //   產生器過期，`syncPlan` 直接跳過它是對的，⛔ 不是漏了 fail-closed。
    const p = planFromPaths(["content/no-such-collection-xyz/x.json"]);
    expect(
      p.full,
      "content/ 底下一個對不到輸入表的路徑沒有讓它 fail-closed —— 那就會漏跑",
    ).toBe(true);
  });

  it("③ CJK 路徑解得開（⛔ 否則每次改文件都會退化成全跑）", () => {
    expect(
      /core\.quotepath=false/.test(code),
      "沒有關掉 git 的 quotepath —— CJK 路徑會被印成 C 風格跳脫，" +
        "對不到任何輸入表 ⇒ 每一次純文件改動都 fail-closed 成全跑。",
    ).toBe(true);
  });

  it("裁剪真的有裁到（改一行客戶端程式 ⛔ 不該跑 33 支）", () => {
    const p = planFromPaths(["apps/client/src/GameApp.ts"]);
    expect(p.full).toBe(false);
    expect(p.steps.length).toBeGreaterThan(0);
    expect(
      p.steps.length,
      "改一行客戶端程式卻要跑一半以上的產生器 —— 輸入表退化了（多半是註解沒剝乾淨）",
    ).toBeLessThan(p.steps.length + p.skipped.length);
    expect(p.skipped.length).toBeGreaterThan(0);
  });
});

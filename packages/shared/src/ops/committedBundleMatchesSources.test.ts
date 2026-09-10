/**
 * ⭐ GH#1180 —— **「第十一回合開了」四個 commit，而玩家拿到 false**。
 *
 * `5a2adb139` 把 `content/config/arena-rules.json` 的 `round11.enabled` 改成 true，⛔ 沒有把
 * `content:build` 的產物一起 commit ⇒ git 裡的 bundle 內嵌的仍是 false，一路帶到部署的 `7b639e630`。
 * ⭐ 而 `shippedBundleIsCurrent` 沒有叫 —— 它讀的是**工作區**（`readBundle(CONTENT_DIR)`）：
 * 只要有人在跑它之前重生成過工作區的 bundle，它就是綠的，而 git 裡那一份仍是舊的。
 *
 * ⭐ 這一條只讀 git：對 commit 進去的來源重算 builder 自己的 `hashDoc`，和 commit 進去的
 * bundle／索引記的雜湊比（⛔ 不整棵重建 —— 幾秒；⛔ 不深比對 doc —— builder 會正規化舊格式）。
 * 夾具是真實的 commit。MUTATION：把 `auditBundle` 的 `h !== e.hash` 改成 `false` ⇒ 夾具 `7b639e630` 從紅變綠。
 */
import { describe, it, expect } from "vitest";
import { exportContentAt, hasGit, revExists } from "./gitTreeExport";
import { auditBundle } from "./committedTreeAudit";

const SKIP = !hasGit();
const FIXTURE_RED = "7b639e630";   // 2026-09-10 真的部署、round11 仍是 false 的那一個
const FIXTURE_GREEN = "b6686109a"; // 現行 builder 從它自己的來源建的（合併 #1182 之後）

describe("GH#1180 committed bundle.json ↔ committed sources（⭐ 只讀 git，重算 hashDoc）", () => {
  it("HEAD：bundle／索引記的雜湊等於對 git 樹裡來源重算的（⛔ 不等 = 玩家拿到舊內容）", (ctx) => {
    if (SKIP) { console.warn("⚠️ 沒有 .git ⇒ 這條閘**沒驗到**（不是綠）"); ctx.skip(); return; }
    const a = auditBundle(exportContentAt("HEAD"));
    expect(a.entries).toBeGreaterThan(0);
    expect(a.stale, `修法：pnpm content:build && git add content/   （cv=${a.contentVersion}）`).toEqual([]);
  });

  it(`★ 夾具 ${FIXTURE_RED}（真的部署過的那個）必須紅在 config/arena-rules；${FIXTURE_GREEN} 綠`, (ctx) => {
    if (SKIP || !revExists(FIXTURE_RED) || !revExists(FIXTURE_GREEN)) { console.warn("⚠️ 夾具不在本機 ⇒ 量尺沒自證"); ctx.skip(); return; }
    const red = auditBundle(exportContentAt(FIXTURE_RED));
    expect(red.stale.some((s) => s.startsWith("config/arena-rules"))).toBe(true);
    expect(auditBundle(exportContentAt(FIXTURE_GREEN)).stale).toEqual([]);
  });
});

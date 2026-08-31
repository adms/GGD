/**
 * ⭐⭐ GH#884 —— **未追蹤檔在 `git checkout -f` 底下會被靜靜毀掉**。
 *
 * ── ⚠️ 票文說的是另一個形狀 ────────────────────────────────────────────────
 * 票文量的是 `host-deploy.sh` 的 `git pull`：它**中止**並指名檔案
 *（"would be overwritten by merge / Aborting"）。
 * ⭐ 而 `mini-deploy.sh` 走的是 `git fetch` + **`git checkout -f`**，
 * 2026-08-31 實測它的行為**相反**：
 *
 *     echo HOST-LOCAL > newfile.txt          # 未追蹤，與目標 commit 的同名檔衝突
 *     git checkout -f other  ⇒ **EXIT 0**，而檔案內容變成 commit 的版本
 *
 * ⇒ ⛔ **它不停，它毀。** 而 owner 的常設規矩逐字是
 *   「你要做**取代**這種事情以前都要**備份**」。
 *
 * ── ⭐ 這條守衛驗的是**那個 git 行為**，⛔ 不是腳本裡的字串 ────────────────
 * ⚠️ 一條 `expect(SRC).toContain("備份")` 對「備份寫錯了」是瞎的。
 * ⭐ 這裡真的建一個 repo、真的造出碰撞、真的 checkout ——
 * ⛔ 因為「git 會不會毀掉它」正是這張票唯一的前提。
 *
 * MUTATION LOG（落地前跑過）：
 *   · 把 `mini-deploy.sh` 的 `clash` 偵測那一段拿掉 → 「腳本在 checkout 前先算碰撞」紅
 *   · 把備份的 `cp -p` 改成 `mv` → 「用 cp ⛔ 不是 mv」紅
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../../../scripts/mini-deploy.sh");
const git = (cwd: string, ...a: string[]): string =>
  execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

describe("GH#884 未追蹤檔與 checkout", () => {
  it("★ ⭐ **前提自證**：`git checkout -f` 真的會靜靜覆蓋未追蹤檔", () => {
    const d = mkdtempSync(join(tmpdir(), "mini-untracked-"));
    git(d, "init", "-q", ".");
    git(d, "config", "user.email", "t@t");
    git(d, "config", "user.name", "t");
    writeFileSync(join(d, "a.txt"), "v1");
    git(d, "add", "-A");
    git(d, "commit", "-qm", "one");
    const base = git(d, "rev-parse", "HEAD").trim();
    git(d, "checkout", "-qb", "other");
    writeFileSync(join(d, "newfile.txt"), "from-commit");
    git(d, "add", "-A");
    git(d, "commit", "-qm", "two");
    const target = git(d, "rev-parse", "HEAD").trim();
    git(d, "checkout", "-q", base);
    // ⭐ 未追蹤，且與目標 commit 的同名檔衝突
    writeFileSync(join(d, "newfile.txt"), "HOST-LOCAL-CONTENT");
    git(d, "checkout", "-f", "-q", target);
    expect(
      readFileSync(join(d, "newfile.txt"), "utf8"),
      "⚠️ git 的行為變了 ⇒ ⭐ 這張票的前提要重新量（⛔ 不要直接改這條斷言）",
    ).toBe("from-commit");
  });

  it("★ ⭐ 腳本在 checkout **之前**先算出碰撞（⛔ 不是事後補救）", () => {
    const src = readFileSync(SCRIPT, "utf8");
    const iClash = src.indexOf("clash=$(r ");
    const iCheckout = src.indexOf('git checkout -f -q $head_local"');
    expect(iClash, "⛔ 沒有碰撞偵測").toBeGreaterThan(0);
    expect(iClash, "⛔ 偵測寫在 checkout **之後** = 檔案已經沒了").toBeLessThan(iCheckout);
  });

  it("⭐ 備份用 **`cp`**，⛔ 不是 `mv`（owner：「用 cp 避免資料不完整」）", () => {
    const src = readFileSync(SCRIPT, "utf8");
    const i = src.indexOf("clash=$(r ");
    const win = src.slice(i, src.indexOf('git checkout -f -q $head_local"'));
    expect(win).toContain("cp -p");
    expect(win, "⛔ `mv` 會讓中斷時兩邊都不完整").not.toMatch(/\bmv\s+["'$]/);
  });

  it("⭐ 備份不起來的（root 所有）⇒ **指名並停下來**，⛔ 不是靜默繼續", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).toContain("_failed.txt");
    expect(src, "⛔ 沒有把 sudo 這件事說出來").toContain("需要 sudo");
  });

  it("⭐ **後置條件**：checkout 之後備份還在（⛔「備份了」≠「備份成功了」）", () => {
    const src = readFileSync(SCRIPT, "utf8");
    const i = src.indexOf('git checkout -f -q $head_local"');
    expect(
      src.slice(i, i + 700),
      "⛔ checkout 之後沒有複驗備份 —— 那正是「靜默失敗」的形狀",
    ).toContain("備份複驗");
  });
});

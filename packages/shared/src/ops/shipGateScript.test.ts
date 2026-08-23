/**
 * 🚢 **`pnpm ship:check` 的閘** —— owner 2026-08-23：「**這些應該是自動化 script 跑吧？**」
 *
 * 在此之前那是**一行手打的 shell**（`( … ) & ( … ) & wait`）。手打的東西下一次會
 * 漏掉一包、會忘記不 fail-fast、會忘記序列段必須先跑。⇒ 這一條把三件事釘死。
 *
 * ⭐ 而第一條**當場就有價值**：我手寫的清單漏了三包
 *（`apps/content-api`、`apps/editor`、`apps/test-dashboard`），
 * 它們的紅燈在出貨前**一次都不會出現**。⇒ 清單改成推導，這一條驗那份推導。
 *
 * ⚠️ 它驗的是**關係**⛔ 不是名詞（2026-08-02 的教訓：只驗名詞的後置條件在相容性
 * 故障面前必然是綠的）。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { packagesWithVitest } from "../../../../tools/parallel-gates/packages.mjs";

const REPO = join(__dirname, "../../../..");
const code = readFileSync(join(REPO, "tools/parallel-gates/ship.mjs"), "utf8");

describe("pnpm ship:check", () => {
  it("★ 每一個有 vitest 的 package 都在並行段裡（漏一包 = 那一包永遠不會紅）", () => {
    // ⭐ 跑**出貨的那一支**掃描器，⛔ 不是掃 ship.mjs 的原始碼字串
    //（失敗形態⑥：用掃字串代替跑真的東西）。
    const listed: string[] = packagesWithVitest(REPO);
    expect(listed.length, "一包都沒掃到 —— 掃描器壞了").toBeGreaterThan(3);
    for (const p of listed) {
      const pkg = JSON.parse(readFileSync(join(REPO, p, "package.json"), "utf8")) as {
        scripts?: Record<string, string>;
      };
      expect(pkg.scripts?.test, `${p} 被掃進來了但它沒有 vitest`).toContain("vitest");
    }
    // 而 ship.mjs 真的用它，⛔ 不是自己另外手寫一張表。
    expect(
      /packagesWithVitest\(REPO\)/.test(code),
      "ship.mjs 沒有用那支掃描器 —— 手寫的清單會過期而且⛔ 不會有東西紅（我第一版就漏了三包）。",
    ).toBe(true);
    expect(
      /"packages\/shared"|"apps\/client"/.test(code),
      "ship.mjs 裡還留著手寫的 package 名字 —— 那就是會過期的第二個住處。",
    ).toBe(false);
  });

  it("並行段 ⛔ 不 fail-fast —— 一次撈全部的錯", () => {
    expect(/一次列完/.test(code)).toBe(true);
    expect(
      /for \(const f of failed\)/.test(code),
      "沒有逐條列出失敗的閘 —— 那就會變成「跑一次改一個」，第零守則量到那是 50 分鐘。",
    ).toBe(true);
  });

  it("★ 全域鎖那一段跑在並行段**之前**（產物過期 ⇒ 下游全是誤導的紅燈）", () => {
    const serialAt = code.indexOf("① 序列段");
    const parallelAt = code.indexOf("② 並行段");
    expect(serialAt, "找不到序列段").toBeGreaterThan(-1);
    expect(parallelAt, "找不到並行段").toBeGreaterThan(-1);
    expect(
      serialAt < parallelAt,
      "並行段跑在全域鎖前面 —— 那會拿過期的 bundle.json 去驗，紅的原因會指向錯的地方。",
    ).toBe(true);
    // 而序列段自己**要** fail-fast（跟並行段相反，理由寫在腳本裡）。
    expect(/序列段紅了就停/.test(code)).toBe(true);
  });

  it("`pnpm ship:check` 這個入口真的存在", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["ship:check"]).toContain("ship.mjs");
    expect(existsSync(join(REPO, "tools/parallel-gates/ship.mjs"))).toBe(true);
  });
});

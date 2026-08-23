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
import { spawnSync } from "node:child_process";
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

  it("★ 時間帳本只有**一份** —— ⛔ 不是自己再開一份同名不同義的", () => {
    // ⚠️ 我第一版真的自己寫了一份 `deploy-timings.json`，schema 與
    // `tools/deploy-timing` 的 `ggd-deploy-timings@1` 不相容 ——
    // 同一份知識兩個住處，之後各自漂（第〇·四守則的反例）。
    expect(
      /from "\.\.\/deploy-timing\/run\.mjs"/.test(code),
      "ship.mjs 沒有用 tools/deploy-timing 的寫入函式 —— 那就是第二份帳本。",
    ).toBe(true);
    expect(
      /writeFileSync\([^)]*deploy-timings/.test(code),
      "ship.mjs 自己在寫帳本檔 —— 帳本只能有一個寫入者。",
    ).toBe(false);
  });

  it("★ 並行段要**分核**，⛔ 不是每包都開滿", () => {
    // 量到的：7 包 × 各自 maxForks 16 = 112 個 fork 搶 18 核
    // ⇒ mobWavesSave 從 885ms 飄到 5472ms 而撞破 5 秒額度。
    // ⛔ 那時候最不該做的是調高那一條的 timeout（把「機器很忙」永久靜音）。
    expect(/FORKS_PER_SUITE/.test(code)).toBe(true);
    expect(
      /--poolOptions\.forks\.maxForks/.test(code),
      "沒有把分到的核數交給 vitest —— 那七包會各自開滿，timeout 會開始飄。",
    ).toBe(true);
  });

  it(
    "★ 什麼旗標都不帶 ⇒ base 預設 origin/main,裁剪引擎**真的**被呼叫（2026-08-23:5 次跑閘裁剪 0 次生效）",
    () => {
      // ⭐ 跑**出貨的那一支**（`--list` 只印決定,一支閘都不跑）,⛔ 不是 regex 掃原始碼
      //（失敗形態⑥）。stdout 是給機器逐行 parse 的名單,裁剪的決定印在 stderr。
      const env = { ...process.env, GGD_SYNC_FETCH_TIMEOUT_MS: "8000" };
      delete env.GGD_DEPLOYED_REF; // 這一條測的正是「什麼都沒給」的預設
      const r = spawnSync("node", ["tools/parallel-gates/ship.mjs", "--list"], {
        cwd: REPO,
        encoding: "utf8",
        env,
        timeout: 25000,
      });
      expect(r.status).toBe(0);
      const why = String(r.stderr);
      expect(why).toContain("skills:sync 裁剪");
      // 🚨 突變目標:把預設 base 拿掉,就會回到當天 5 次全 miss 的那一句 ⇒ 這裡紅。
      expect(
        why,
        "落進「不知道改了哪些路徑」—— 預設 base 沒接上,裁剪永遠不生效（A4 白做）。",
      ).not.toContain("不知道這一次改了哪些路徑");
      // 而且結果必須**指名原因**:要嘛裁剪真的算過（base＝預設）,要嘛 fail-closed 說得出為什麼。
      expect(why).toMatch(
        /origin\/main\(預設＝上一次 push\)|fail-closed 全跑|算不出計畫|git fetch 失敗|解析不到|距離不對勁/,
      );
    },
    30000,
  );

  it("`pnpm ship:check` 這個入口真的存在", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["ship:check"]).toContain("ship.mjs");
    expect(existsSync(join(REPO, "tools/parallel-gates/ship.mjs"))).toBe(true);
  });
});

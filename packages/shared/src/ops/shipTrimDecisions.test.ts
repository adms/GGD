/**
 * 🚢 出貨閘的兩個裁剪決定（`tools/parallel-gates/shipTrim.mjs`）—— **兩個方向都驗**。
 *
 * ⭐ 為什麼值得一條守衛：這兩個決定**省掉的是判準以外的東西**（重新產生一次產物、
 * 掃沒被改到的檔），⛔ 而它們一旦倒過來就是**靜默地少驗**：
 *   · 探針紅卻跳過重新產生 ⇒ 產物過期照樣出貨（＝ 2026-08-01／08-02 那兩次事故的形狀）
 *   · 不知道改了什麼卻只掃幾個檔 ⇒ lint 變裝飾
 * ⇒ 所以每一條 fail-closed 都要有一條斷言站著。
 *
 * ⚠️ 這一支是**純函式**測試（那支模組沒有 I/O）—— ⛔ 它不假裝驗得到「閘真的跳過了」，
 * 那一段是 `ship.mjs` 的接線（`regen.run` 的唯一讀端）。
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error —— .mjs 工具模組沒有型別宣告（同 repo 其他 ops 測試的作法）
import { regenPlan, lintPlan, LINT_ROOTS } from "../../../../tools/parallel-gates/shipTrim.mjs";

describe("🚢 序列段（重新產生）要不要跑", () => {
  it("★★ 探針綠 ⇒ 跳過；⛔ 其餘每一種狀態都要重新產生（fail-closed）", () => {
    expect(regenPlan({ probeCode: 0 }).run, "⛔ 產物已經逐位元最新，還重新產生一次 ＝ 白花 685 秒").toBe(false);
    for (const [probeCode, what] of [
      [1, "探針紅（產物過期）"],
      [124, "探針被看門狗殺掉"],
      [null, "探針沒跑起來"],
      [undefined, "探針沒跑"],
    ] as const) {
      expect(regenPlan({ probeCode }).run, `⛔ ${what} 卻跳過重新產生 ⇒ 產物過期照樣出貨`).toBe(true);
    }
  });

  it("★ 一鍵回頭與 `--no-sync` 各自照舊", () => {
    expect(regenPlan({ probeCode: 0, disabled: true }).run, "⛔ 開關關著就該照舊重新產生").toBe(true);
    expect(regenPlan({ probeCode: 1, noSync: true }).run, "⛔ --no-sync 時序列段本來就不跑").toBe(false);
  });
});

describe("🚦 lint 這一次掃什麼", () => {
  const exists = () => true;

  it("★★ 只掃改動的檔；⛔ 不知道改了什麼／規則層動了 ⇒ 全掃（fail-closed）", () => {
    const p = lintPlan({ paths: ["apps/client/src/a.ts", "packages/shared/src/b.tsx", "content/config/x.json"], exists });
    expect(p.files, "⛔ 沒有把 content/ 的 JSON 濾掉").toEqual(["apps/client/src/a.ts", "packages/shared/src/b.tsx"]);
    expect(lintPlan({ paths: null }).files, "⛔ 不知道改了哪些路徑卻沒有全掃").toBeNull();
    for (const rule of ["eslint.config.js", "packages/shared/tsconfig.json", "package.json", "pnpm-lock.yaml"]) {
      expect(lintPlan({ paths: ["apps/client/src/a.ts", rule], exists }).files, `⛔ ${rule} 動了卻只掃改動的檔 —— 沒改到的檔也可能從綠變紅`).toBeNull();
    }
  });

  it("★ 刪掉的檔不餵給 eslint；完全沒有 lint 得到的檔 ⇒ 跳過（⛔ 不是全掃）", () => {
    const p = lintPlan({ paths: ["apps/client/src/gone.ts"], exists: () => false });
    expect([p.files, p.skip], "⛔ 把已經刪掉的檔餵給 eslint ⇒ 閘會用『找不到檔』紅，而那不是缺陷").toEqual([[], true]);
    expect(lintPlan({ paths: ["docs/x.md", "content/config/y.json"], exists }).skip, "⛔ 只改文件也去掃整棵樹").toBe(true);
  });

  it("★ lint 的三個 root 與 package.json 的 `lint` 指令對得上", () => {
    // ⭐ 出貨的那一行逐字是 `eslint apps packages tools` —— 這裡抄第二份就會漂
    expect(LINT_ROOTS).toEqual(["apps", "packages", "tools"]);
  });
});

/**
 * 戰鬥手感 / 對戰設定 兩頁**真的掛進 console 了嗎**。
 *
 * 兩支頁面元件本身有 `combatFeelSave.test.ts` / `matchConfigSave.test.ts` 在驅動，
 * 但那兩支是直接 `mount(<CombatFeelPage/>)` —— 它們對「這一頁在 App 裡沒有路由、
 * 導覽列也沒有它」這個缺陷完全免疫。頁面寫得再好，掛不進去就是零。
 *
 * 兩層，和 `quickApprovalBundle.test.ts` 同一個形狀：
 *
 *   1. **行為層（一定跑）**：`pageRequiresSession()` 是真的被匯出的函式，直接問它。
 *      漏掉這一格的話，loopback 的免登入模式會把一個完全可以編輯的表單畫給沒有
 *      session 的操作者，他填完十格才在儲存時吃 401 —— 看起來像壞掉，不像沒登入。
 *   2. **原始碼層（一定跑，但它是原始碼掃描，不是行為）**：App.tsx 有 top-level
 *      靜態 import + 一條路由 + 一列導覽。⚠️ 這一層**證明不了** rollup 沒有把它
 *      dead-fold 掉；能證明的只有 `GGD_BUILD_GATE=1` 那個真的 vite build
 *      （見 quickApprovalBundle.test.ts）。這裡誠實地只宣稱它擋得住「忘了接線」。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { pageRequiresSession } from "./store";

const TAG = "adminui-config-pages-registered";
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

/** 把註解剝掉 —— 這個 repo 的長註解裡什麼字都有，不能讓散文滿足檢查。 */
const code = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const APP = code(read("apps/admin/src/ui/App.tsx"));

const PAGES = [
  { page: "combatFeel", component: "CombatFeelPage", label: "戰鬥手感" },
  { page: "matchConfig", component: "MatchConfigPage", label: "對戰設定" },
] as const;

describe("兩頁真的掛進 console", () => {
  it("都需要 session —— 它們的儲存走 `putOverlayDoc`，沒有 session 一律 401", () => {
    cover(TAG);
    for (const p of PAGES) {
      expect(pageRequiresSession(p.page), `${p.label} 沒有 session-gate`).toBe(true);
    }
    // 對照組：一個刻意不 gate 的頁面。少了它，上面那條在「函式永遠回 true」的
    // 實作下也會過。
    expect(pageRequiresSession("hub")).toBe(false);
  });

  it("App.tsx 有靜態 import、導覽列一列、以及一條路由", () => {
    cover(TAG);
    for (const p of PAGES) {
      expect(APP, `${p.label} 沒有 top-level 靜態 import`).toContain(
        `import { ${p.component} } from "./${p.component}";`,
      );
      expect(APP, `${p.label} 沒有導覽列那一列`).toContain(`page: "${p.page}", label: "${p.label}"`);
      expect(APP, `${p.label} 沒有路由 —— 點進去會是一片空白`).toContain(
        `page === "${p.page}" && <${p.component} />`,
      );
    }
  });

  it("兩頁都**不在** DEV 閘裡面 —— 它們必須存在於正式 bundle", () => {
    cover(TAG);
    // 內容·素材管理那一整套是 `import.meta.env.DEV` 後面的動態 import；這兩頁的
    // 元件名不可以出現在那個閘之後的任何一行。
    const devGateAt = APP.indexOf("import.meta.env.DEV");
    expect(devGateAt).toBeGreaterThan(0);
    for (const p of PAGES) {
      const at = APP.indexOf(`import { ${p.component} }`);
      expect(at, `${p.label} 的 import 跑到 DEV 閘後面去了`).toBeLessThan(devGateAt);
    }
  });
});

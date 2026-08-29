/**
 * `LIVE_ROUTES` 的每一個 `page` 都要**推導得出一個真的存在的 dataset**。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼需要這條閘
 * ---------------------------------------------------------------------------
 * `renderLivePage()` 用 `datasetOf(page)` 把 `liveMdlFamilies` 推成 `mdl-families`，
 * 讓「這份資料多新」那一條列只寫**一次**就服務 14 頁（⛔ 不是手寫對照表）。
 *
 * ⚠️ 而推導**會靜默出錯**：`liveSkill90` 若照一般的 camelCase 規則會變成
 * `skill-90`，而資料集叫 `skill90` ⇒ 那一頁的列會 404，
 * ⭐ **而頁面本身完全正常** —— 一個只有那條列壞掉的頁面，看起來就像沒有那條列。
 *
 * ⇒ 這條閘從**兩頭**走（CLAUDE.md 失敗形態⑫：只驗名詞的反方向會失明）：
 *   ① 每個 route 推導出來的名字，`tools/admin-live/datasets/` 底下要有那個檔
 *   ② 每個 dataset 檔（除了 `_` 開頭的樣板），要有一個 route 指向它
 *      —— ⛔ 否則就是一個沒有人看得到的資料集
 *
 * 突變紀錄：把 `datasetOf` 的 `([a-z])([A-Z])` 改成 `([a-zA-Z])([A-Z0-9])`
 * → `skill90` 變 `skill-90` → 紅並指名。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DATASETS = join(REPO, "tools/admin-live/datasets");
const INDEX = join(REPO, "apps/admin/src/ui/live/index.tsx");

/** 與 `apps/admin/src/ui/live/index.tsx` 的 `datasetOf` 同一條規則。 */
const datasetOf = (page: string): string =>
  page
    .replace(/^live/, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();

/** 從 index.tsx 的 LIVE_ROUTES 撈出每個 `page:` —— ⛔ 不在測試裡抄一份清單。 */
function routePages(): string[] {
  const src = readdirSync(dirname(INDEX)).includes("index.tsx")
    ? require("node:fs").readFileSync(INDEX, "utf-8")
    : "";
  return [...String(src).matchAll(/\bpage:\s*"(live[A-Za-z0-9]+)"/g)].map((m) => m[1]!);
}

const datasetFiles = (): string[] =>
  readdirSync(DATASETS)
    .filter((f) => f.endsWith(".mjs") && !f.startsWith("_"))
    .map((f) => f.replace(/\.mjs$/, ""));

describe("live 頁面的 dataset 名字是推導出來的（GH#865）", () => {
  it("① 每個 route 推導出來的 dataset 都真的存在", () => {
    const missing = routePages()
      .map((p) => ({ page: p, ds: datasetOf(p) }))
      .filter((x) => !existsSync(join(DATASETS, `${x.ds}.mjs`)));
    expect(
      missing,
      `⛔ 這些 route 推導出來的 dataset 檔不存在 —— 那一頁的「重新計算」列會 404，\n` +
        `⚠️ 而頁面本身完全正常，所以沒有人會發現。\n` +
        missing.map((m) => `  ${m.page} → ${m.ds}.mjs`).join("\n"),
    ).toEqual([]);
  });

  it("② 每個 dataset 都有一個 route 指向它（⛔ 反方向也要走）", () => {
    // ⭐ 豁免要帶**能被反駁的理由**（⛔ 不是「還沒做」）。
    const EXEMPT: Record<string, string> = {
      // 健康探測用的最小 dataset —— 刻意沒有頁面。
      // ⛔ 反駁法：指出任何一個 live 頁面在用 `/__live/ping` 的資料。
      ping: "健康探測（middleware 自我檢查），刻意無 UI",
    };
    const covered = new Set(routePages().map(datasetOf));
    const orphans = datasetFiles().filter((d) => !covered.has(d) && !(d in EXEMPT));
    expect(
      orphans,
      `⛔ 這些 dataset 沒有任何 live 頁面在用 —— 它們算得出資料而沒有人看得到：\n` +
        orphans.map((o) => `  ${o}.mjs`).join("\n"),
    ).toEqual([]);
  });

  it("GUARD THE GUARD：真的讀到了 route（⛔ 正則寫壞會空轉）", () => {
    expect(routePages().length).toBeGreaterThan(10);
    expect(datasetFiles().length).toBeGreaterThan(10);
  });
});

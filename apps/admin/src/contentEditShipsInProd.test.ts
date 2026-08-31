/**
 * ⭐⭐ GH#730 —— 內容編輯的 9 頁**進得了正式 build**，而預設是關的。
 *
 * owner 2026-09-01：「**do it quick, 這是你少數分配要做好的事情，專心做好**」
 *
 * ── ⛔ 在此之前的形狀 ────────────────────────────────────────────────────────
 * `App.tsx` 有一行 `if (!import.meta.env.DEV) return;` **緊貼在**
 * `import("./ContentPage")` 上面 ⇒ vite 把旗標折成 `false`、rollup 證明 chunk
 * 到不了 ⇒ ⭐ 正式 build **不含**那 9 頁（⛔ 不是隱藏，是**不存在**）。
 * ⇒ ⭐ 它只在**那台從來不需要它的機器**上可用。
 *
 * ── ⭐ 現在：兩道**獨立**的閘，缺一道就寫不成 ────────────────────────────────
 * | 閘 | 住哪 | 缺了會怎樣 |
 * |---|---|---|
 * | ① 部署時旗標 | `VITE_GGD_CONTENT_EDIT`（Dockerfile ARG ＋ compose） | 頁面在、⛔ 每個寫入端短路 |
 * | ② content-api | compose 的 `profiles: ["dev"]` | 旗標開著也連不上 |
 *
 * ⭐ **兩道都是 fail-loud**：關著時畫面上是**一句說得出原因的話**，
 * ⛔ 不是一個看不見的頁面 —— ⭐ 一個看不見的頁面答不出「為什麼看不見」。
 *
 * MUTATION LOG（兩個都驗過）：
 *   · `App.tsx` 把 `if (!import.meta.env.DEV) return;` 放回去 → 🔴
 *   · `contentApi.ts` 把 `ENABLED` 改回 `isDevBuild()` → 🔴
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

describe("GH#730 內容編輯進得了正式 build", () => {
  it("★ ⭐ 部署時旗標**三個住處齊全**（⛔ 少一個就打不開）", () => {
    // ① 程式讀它
    expect(read("apps/admin/src/contentApi.ts"), "⛔ contentApi 沒讀旗標").toContain(
      "VITE_GGD_CONTENT_EDIT",
    );
    // ② Dockerfile 收得到（⛔ vite 只認 build 期就在的 env）
    const df = read("docker/edge.Dockerfile");
    expect(df, "⛔ Dockerfile 沒有 ARG —— 旗標永遠傳不進 vite").toMatch(
      /ARG VITE_GGD_CONTENT_EDIT/,
    );
    expect(df).toMatch(/ENV VITE_GGD_CONTENT_EDIT=\$VITE_GGD_CONTENT_EDIT/);
    // ③ compose 傳得進去
    expect(read("docker/compose.family.yaml"), "⛔ compose 沒有那一格").toContain(
      "VITE_GGD_CONTENT_EDIT",
    );
  });

  it("★ ⭐ 出貨預設是**關的**（⛔ 一個預設開著的寫入端等於把 content 交出去）", () => {
    expect(read("docker/compose.family.yaml")).toMatch(/VITE_GGD_CONTENT_EDIT:\s*""/);
    expect(read("docker/edge.Dockerfile")).toMatch(/ARG VITE_GGD_CONTENT_EDIT=""/);
  });

  it("★ ⭐ 關著時的訊息**說得出兩道閘**（fail-loud ⛔ 不是 fail-absent）", () => {
    const src = read("apps/admin/src/contentApi.ts");
    expect(src, "⛔ 沒告訴人要給哪個 env").toContain("VITE_GGD_CONTENT_EDIT=1");
    expect(src, "⛔ 沒告訴人 content-api 也要跑 —— 那是第二道獨立的閘").toContain("content-api");
  });

  it("⭐ dev 的行為**一格沒變**（本機仍然自動開）", () => {
    const src = read("apps/admin/src/contentApi.ts");
    expect(src).toMatch(/if \(isDevBuild\(\)\) return true;/);
  });
});

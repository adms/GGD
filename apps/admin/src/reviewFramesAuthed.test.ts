/**
 * 🖼️ **連續圖片要走帶身分的載入** —— owner 2026-08-27「連續圖片**全部**都看不到」的閘。
 *
 * ## 為什麼這一條抓得到，而既有的每一條都抓不到
 * `liveAuth.test.ts` 證明了 `fetch()` **會**帶 token；`reviewAdminGate.test.ts` 證明了
 * 伺服器**會**擋沒有 token 的請求。⭐ 兩條都是對的，而**它們的組合是空的**：
 * `<img src="/__review/frame?p=…">` 是**瀏覽器的圖片載入**，⛔ 不是 `fetch()`
 * ⇒ 攔截器碰不到它 ⇒ **每一張圖回 401** ⇒ 全部空白。
 *
 * ⚠️ 而頁面照樣寫著「**N 張連續圖片**」（清單走 fetch，是好的）
 * ⇒ ⭐ **壞掉跟正常長得一模一樣**（失敗形態⑧的親戚：消費端在，而它消費不到）。
 *
 * ## ⛔ 它問的是「有沒有裸的 `<img src>`」，⛔ 不是「有沒有 AuthedImg 這個字」
 * 後者在「兩種都寫了」時仍然綠。
 *
 * ── 突變紀錄（一批一條）────────────────────────────────────────────────
 *  · 把 `FeatureReviewPage.tsx` 的 `<AuthedImg …/>` 改回
 *    `<img src={`/__review/frame?p=…`} />` → 這一條紅並指名該檔。實測過。
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, ".");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

describe("批核頁的連續圖片要帶身分 (review-frames-authed)", () => {
  it("⭐ ⛔ 全 admin 不可以有裸的 `<img src=…/__review/frame…>`（那是 401 ⇒ 全部空白）", () => {
    const files = walk(SRC);
    expect(files.length, "掃不到任何 admin 原始碼 —— 母體壞了").toBeGreaterThan(20);

    const bad = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      // ⚠️ `<img` 與 `src=` 可能被換行拆開 ⇒ 抓「一個 <img 標籤內文裡有 __review/frame」。
      return [...src.matchAll(/<img\b[\s\S]{0,400}?\/>/g)].some((m) => m[0].includes("__review/frame"));
    });

    expect(
      bad.map((f) => f.replace(`${SRC}/`, "")).join("\n"),
      "⛔ 裸的 `<img src>` 是**瀏覽器的圖片載入**，`liveAuth.ts` 的 fetch 攔截器碰不到它\n" +
        "   ⇒ `/__review/frame` 的 admin 閘（#796）讓每一張圖回 **401** ⇒ 連續圖片全部空白，\n" +
        "   ⭐ 而清單照樣寫著「N 張連續圖片」（清單走 fetch）⇒ 壞掉跟正常長得一模一樣。\n" +
        "   → 改用 `<AuthedImg rel={…} />`（`ui/live/AuthedImg.tsx`）。⛔ 不要改這條測試。\n",
    ).toBe("");
  });

  it("⭐ 反方向：`AuthedImg` 真的走 `fetch()` 並且會 revoke blob（⛔ 不是換個名字的 `<img src>`）", () => {
    const src = readFileSync(join(SRC, "ui/live/AuthedImg.tsx"), "utf8");
    expect(src, "⛔ AuthedImg 沒走 fetch —— 那就帶不上 token").toContain("fetch(`/__review/frame");
    expect(src, "⛔ 沒有 revokeObjectURL —— 一批 110 張，每翻一批漏一份記憶體").toContain(
      "URL.revokeObjectURL",
    );
    expect(src, "⛔ 載不到時沒有說出來 —— 空白框與「本來就沒有圖」長得一模一樣").toContain("載不到");
  });
});

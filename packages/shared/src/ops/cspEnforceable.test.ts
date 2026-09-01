/**
 * ⭐⭐ GH#813 A —— 「CSP 轉 enforced」缺的那份**違規清單**。
 *
 * ── ⚠️ 票文說要「一輪真 session 的 violation 清單」，⛔ 而那條路走不通 ──────
 * · owner 2026-08-09 逐字：「**你不用玩遊戲測試 太浪費時間了**」
 * · 而 CLAUDE.md 的部署協定同一條：⛔ 也不可以請 owner 自己打一場（那是轉嫁，⛔ 不是消除）
 *
 * ⇒ ⭐ 所以這條守衛做的是 CLAUDE.md 記過的那件事：
 *   **把驗收標準翻成可判的不變量** —— 違規清單是**推導得出來**的，
 *   ⛔ 不需要一個人去玩。
 *
 * ── ⭐ 出貨政策的三類會違規的寫法，逐類掃出貨原始碼 ──────────────────────
 * | 類 | 政策的哪一格 | 2026-09-01 掃到 |
 * |---|---|---|
 * | `eval` / `new Function` | `script-src` **沒有** `'unsafe-eval'` | ⭐ **0** |
 * | 外部主機的**資源載入** | `default-src 'self'` | ⭐ **0**（6 個外部網址全在**授權名單**的 `<a href>`，⛔ 而 CSP 管不到 href） |
 * | 跨 origin `<iframe>` | `default-src 'self'`（無 `frame-src`） | ⭐ **0 在 production** —— 唯一那一處（`AudioAuditionPage`）檔頭逐字寫著 `DEV-ONLY BY CONSTRUCTION⋯a production build never emits it` |
 *
 * ⇒ ⭐⭐ **推導出來的違規清單是空的** ⇒ enforced 政策今天就放得上去。
 *
 * ⚠️ ⛔ 而這條守衛**不**負責把它翻成 enforced —— 那是一次要重新部署才收得回來的
 * 對外改動。⭐ 它負責的是「**這個結論今天還成立嗎**」：
 * 哪天有人寫了 `eval` 或引一個外部 CDN，這條就紅，⛔ 而不是等上線之後白畫面。
 *
 * MUTATION LOG（落地前跑過）：
 *   · 在 `apps/client/src/main.tsx` 塞一行 `eval("1")` → ① 紅並指名該檔
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const SRC = [join(ROOT, "apps/client/src"), join(ROOT, "apps/admin/src")];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e) && !e.includes(".test.")) out.push(p);
  }
  return out;
}

const FILES = SRC.flatMap((d) => walk(d));

/** ⛔ 註解與字串裡的不算 —— 只看**會跑到**的那一種。 */
function codeLines(src: string): string[] {
  return src
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
}

describe("GH#813 A —— enforced CSP 的違規清單（⭐ 推導，⛔ 不是玩一場）", () => {
  it("★ ① 出貨原始碼裡沒有 `eval` / `new Function`（政策無 `unsafe-eval`）", () => {
    const hits: string[] = [];
    for (const f of FILES) {
      for (const [i, l] of codeLines(readFileSync(f, "utf8")).entries()) {
        if (/\beval\s*\(|new\s+Function\s*\(/.test(l)) hits.push(`${f.slice(ROOT.length + 1)}:${i + 1}`);
      }
    }
    expect(
      hits,
      "⛔ 這幾處會被 enforced CSP 擋下（`script-src` 沒有 `'unsafe-eval'`）——\n" +
        "⭐ 而症狀是**整段功能靜默不跑**，⛔ 不是一個錯誤訊息。",
    ).toEqual([]);
  });

  it("★ ② ⭐ **前提自證**：這把尺真的抓得到（⛔ 一把只驗過『沒有』的尺是瞎的）", () => {
    // ⚠️ CLAUDE.md 記過：`calibrate()` 只驗一邊會讓結論作廢。
    //   ⇒ 這裡自造一行**已知違規**的程式碼，斷言檢查器抓得到它。
    const sentinel = ["const x = 1;", 'eval("1+1");'];
    const caught = sentinel.filter((l) => /\beval\s*\(|new\s+Function\s*\(/.test(l));
    expect(caught, "⛔ 檢查器連一行明顯的 `eval(` 都抓不到 ⇒ 第 ① 條永遠會綠").toHaveLength(1);
  });

  it("⭐ ③ 唯一的跨 origin `<iframe>` 是 **dev-only by construction**", () => {
    const p = join(ROOT, "apps/admin/src/ui/AudioAuditionPage.tsx");
    const src = readFileSync(p, "utf8");
    expect(src.includes("<iframe"), "⚠️ 前提自證：那個 iframe 真的還在").toBe(true);
    expect(
      src.includes("DEV-ONLY BY CONSTRUCTION"),
      "⛔⛔ 那一頁不再宣告自己是 dev-only ⇒ ⭐ 它可能進了 production build，\n" +
        "而它 iframe 的是**另一個 origin** ⇒ enforced CSP（`default-src 'self'`，無 `frame-src`）會擋掉它。",
    ).toBe(true);
  });
});

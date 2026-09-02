/**
 * ⭐⭐ **交給外部編輯器的那份文件，不可以宣稱一個正式站上不存在的表面。**
 *
 * ── ⛔⛔ 2026-09-02 抓到的（我自己寫的文件）─────────────────────────────
 * `MAIN_TO_EDITOR_RESPONSE_20260902.md` 列出了
 * `/api/v1/content-import/contract-index` 等六條 route，
 * ⛔ 而它們在 `https://ggd.adms.ai` 上是 **404**。
 *
 * ⭐ 而那**不是**部署失敗 —— `docker/edge.Dockerfile` 逐字寫著：
 *
 * > 「`/content-api/` is **deliberately absent from the production nginx**…
 * >   the surface a deploy does not contain **cannot be reached**」
 *
 * ⇒ ⭐ 正式站**根本不出貨那一整個表面**（GH#239 之後的裁決）。
 *
 * ── ⚠️ 為什麼這值得一條守衛 ─────────────────────────────────────────────
 * CLAUDE.md 逐字：「⛔ **「它沒有在跑」與「它在哪一個環境沒有在跑」是兩件事**」
 * ⇒ 對面照文件對著正式站接，會拿到 404 而**誤判成「main 沒做」**
 * ⇒ ⭐ 而那個誤判的代價是最貴的一種：**再做一次已經存在的東西**。
 *
 * ── ⭐ 這條守衛問的是**關係**，⛔ 不是名詞 ──────────────────────────────
 * ⛔ 不問「文件裡有沒有提到 route」（有），
 * ⛔ 也不問「route 存不存在」（存在）。
 * ⭐ 問的是：**文件有沒有說清楚它們在哪一個環境拿得到。**
 *
 * MUTATION LOG（落地前真的跑過）：
 *   · 文件裡那一節刪掉 → 🔴（指名它少了哪一句）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const DOC = resolve(ROOT, "docs/editor-contract/MAIN_TO_EDITOR_RESPONSE_20260902.md");
const DOCKERFILE = resolve(ROOT, "docker/edge.Dockerfile");

describe("交給編輯器的文件不可以宣稱不存在的表面", () => {
  it("★★ ⭐ 出貨的 edge **確實**把 `/content-api/` 排除在外（⛔ 這是前提）", () => {
    // ⚠️ ⭐ 那句話在 Dockerfile 裡被**折成兩行**（`# ` 開頭的註解）
    //   ⇒ ⛔ 一個吃換行的字面比對會找不到它。⭐ 把註解的換行與 `#` 壓掉再比。
    const df = readFileSync(DOCKERFILE, "utf8")
      .split("\n")
      .map((l) => l.replace(/^#\s?/, ""))
      .join(" ")
      .replace(/\s+/g, " ");
    expect(
      df.includes("deliberately absent from the production nginx"),
      "⛔ `edge.Dockerfile` 不再說 `/content-api/` 被排除 ⇒\n" +
        "   ⭐ 那**可能是好消息**（表面上線了），⛔ 但這條守衛與那份文件都要跟著改。\n" +
        "   ⇒ 先確認正式站真的服務得到那些 route，再更新兩邊。",
    ).toBe(true);
  });

  it("★★ ⭐⭐ 而回交文件**說清楚了**那些 route 在哪一個環境拿得到", () => {
    expect(existsSync(DOC), "⛔ 回交文件不見了").toBe(true);
    const doc = readFileSync(DOC, "utf8");
    // ⭐ 三個都要有：**列了 route** ＋ **說它正式站 404** ＋ **說去哪裡拿**
    expect(doc, "儀器：文件沒有列那些 route ⇒ 下面兩條在量空氣").toContain(
      "/api/v1/content-import/contract-index",
    );
    expect(
      doc.includes("404"),
      "⛔⛔ 文件列了 `/api/v1/...` 卻**沒說它們在正式站上是 404** ⇒\n" +
        "   ⭐ 對面照著接會誤判成「main 沒做」，⛔ 而代價是**再做一次已經存在的東西**。",
    ).toBe(true);
    expect(
      doc.includes("deliberately absent from the production nginx"),
      "⛔ 沒有引用**出貨原始碼**的那句話 ⇒ 讀的人分不出「壞了」與「刻意的」。",
    ).toBe(true);
    expect(
      doc.includes("loopback") || doc.includes("dev:editor"),
      "⛔ 說了「拿不到」卻沒說**去哪裡拿得到** ⇒ 一個只有壞消息的更正。",
    ).toBe(true);
  });

  it("★ ⭐ 靜態那幾份**確實**在 `content/` 底下（⛔ 文件說它們正式站拿得到）", () => {
    for (const f of [
      "content/editor-target-profile.json",
      "content/assets-manifest.json",
      "content/bundle.json",
      "content/manifest.json",
    ]) {
      expect(existsSync(resolve(ROOT, f)), `⛔ 文件說正式站拿得到 ${f}，而它不在 repo 裡`).toBe(
        true,
      );
    }
  });
});

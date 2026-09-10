/**
 * 🖼 **出貨圖示目錄：每一張圖都有文件引用它，每一份引用都找得到圖**（GH#1137）。
 *
 * ── ⛔ 量到的（2026-09-09）────────────────────────────────────────────────
 * `content/assets/icons/items/` 有 **254** 張圖，而 `content/items/*.json` 只引用 **142** 張
 * ⇒ ⭐ **112 張孤兒**，⛔ 而它們**全部 112 張**對得上 `content/_legacy/` 的下架道具。
 *
 * ⚠️ ⭐ 而票文說的「它們進 `bundle.json` 出貨、佔 nginx 流量」**是錯的** ——
 * 實測 bundle 與 manifest 提到它們 **0 次**（圖是靜態檔，⛔ 不是被內嵌的文件）。
 * ⇒ ⭐ 真正的代價是**下一次重畫**：`batch.py` 照 `.method` sidecar 數決定範圍
 *   ⇒ 會多畫 **104 張沒有人用的**。
 *
 * ── ⭐ 為什麼是**兩個方向** ────────────────────────────────────────────────
 * CLAUDE.md 記過「⑫ 只驗名詞不驗關係的反方向」：
 * 從「引用」走 ⇒ 一定漏掉**有圖而無人引用**的；從「圖」走 ⇒ 一定漏掉**有引用而無圖**的。
 * ⇒ ⭐ 兩頭都走，⛔ 一頭不算。
 *
 * ⚠️ ⭐ 分母是**推導的**（掃目錄 ＋ 讀文件的 `icon` 欄位），⛔ 不是寫死的 142／254 ——
 * 一個寫死的數字下一次上架道具就過期，而它會用**錯誤的訊息**紅。
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 每一個「文件目錄 ↔ 圖示目錄」的配對。⛔ 名單是推導的：有圖示目錄的集合才算。 */
const PAIRS = [
  { collection: "items", dir: "content/assets/icons/items" },
  { collection: "champions", dir: "content/assets/icons/champions" },
  { collection: "abilities", dir: "content/assets/icons/abilities" },
].filter((p) => existsSync(join(REPO, p.dir)) && existsSync(join(REPO, "content", p.collection)));

const IMG = /\.(webp|png)$/i;

function survey(collection: string, dir: string) {
  const referenced = new Set<string>();
  for (const f of readdirSync(join(REPO, "content", collection))) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(REPO, "content", collection, f), "utf8")) as {
      icon?: unknown;
    };
    if (typeof doc.icon === "string" && doc.icon) referenced.add(basename(doc.icon));
  }
  const present = new Set(readdirSync(join(REPO, dir)).filter((f) => IMG.test(f)));
  const orphan = [...present].filter((f) => !referenced.has(f)).sort();
  const missing = [...referenced].filter((f) => !present.has(f)).sort();
  return { referenced, present, orphan, missing };
}

describe("🖼 出貨圖示目錄的兩個方向（GH#1137）", () => {
  it("⭐ 量尺自證：真的有圖示目錄、真的有文件引用（⛔ 不是在量空氣）", () => {
    expect(PAIRS.length, "⛔ 一個配對都沒有 —— 目錄結構變了，這條閘在守空集合").toBeGreaterThan(0);
    for (const p of PAIRS) {
      const s = survey(p.collection, p.dir);
      expect(s.present.size, `⛔ ${p.dir} 是空的`).toBeGreaterThan(0);
      expect(s.referenced.size, `⛔ content/${p.collection} 沒有任何 icon 欄位`).toBeGreaterThan(0);
    }
  });

  it("★ ⭐ **方向一：每一張出貨的圖都有文件引用它**（⛔ 孤兒 = 下一次重畫的浪費）", () => {
    const bad = PAIRS.flatMap((p) => {
      const { orphan } = survey(p.collection, p.dir);
      return orphan.length
        ? [`${p.dir}: ${orphan.length} 張沒有人引用 —— ${orphan.slice(0, 6).join(", ")}${orphan.length > 6 ? " …" : ""}`]
        : [];
    });
    expect(
      bad.join("\n"),
      "⛔ 出貨圖示目錄裡有沒有人引用的圖。\n" +
        "⭐ 多半是下架道具的圖 ⇒ 連同它的 `<檔名>.method` sidecar 一起搬到 " +
        "`content/_legacy/assets/icons/<集合>/`（⛔ 不要刪 —— owner：「沒有東西可以丟掉」）。\n" +
        "⚠️ ⭐ 為什麼要管：`batch.py` 照 sidecar 決定重畫範圍 ⇒ 孤兒會被**重畫一次**。",
    ).toBe("");
  });

  it("★ ⭐ **方向二：每一份引用都找得到圖**（⛔ 缺圖 = 卡面上一個字母方塊）", () => {
    const bad = PAIRS.flatMap((p) => {
      const { missing } = survey(p.collection, p.dir);
      return missing.length
        ? [`${p.dir}: ${missing.length} 份引用找不到檔 —— ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? " …" : ""}`]
        : [];
    });
    expect(
      bad.join("\n"),
      "⛔ 有文件指著一張不存在的圖 —— 玩家看到的是 GlyphTile 的**字母方塊**\n" +
        "（「根本不知道哪招是哪招」正是 #110 讓卡面圖示變必填的原因）。",
    ).toBe("");
  });
});

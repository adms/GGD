/**
 * 出貨的那一份 `content/config/item-card.json` 的守衛,兩件事:
 *
 *   ① 它與程式裡的保險絲 `DEFAULT_ITEM_CARD` 一字不差(drift)。
 *   ② **那 49 支傳說武器裡出現過的每一個 `[標記]`,表上都查得到**。
 *
 * ② 才是這個檔真正的價值,而且它是會腐爛的那一種問題:owner 明天寫一支新傳說,
 * 用了一個沒人登記的標記,卡片仍然畫得出來(有 `unknownCategory` 保底),所以
 * **沒有任何畫面會壞掉,也沒有人會發現分類是猜的**。這一條把「猜」變成紅燈。
 *
 * ⚠️ 它讀的是**出貨池**(`loot-tables/legendary-weapons.json`)而不是一份寫死的
 * id 清單,所以池子擴充時這條守衛跟著長 —— 同 `legendary49OwnerText.test.ts`
 * 第二條的理由。
 */
import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { DEFAULT_ITEM_CARD, zConfigItemCardDoc } from "./schema/config";
import { parseItemCard } from "./itemCardText";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf-8")) as T;

const shipped = readJson<unknown>(join(CONTENT_DIR, "config", "item-card.json"));
const poolIds = readJson<{ entries: { itemId: string }[] }>(
  join(CONTENT_DIR, "loot-tables", "legendary-weapons.json"),
).entries.map((e) => e.itemId);
const descOf = (id: string) =>
  readJson<{ name: string; description?: string }>(join(CONTENT_DIR, "items", `${id}.json`));

describe("config.item-card@1 出貨文件 (item-card-shipped)", () => {
  it("通過自己的 Zod schema", () => {
    expect(() => zConfigItemCardDoc.parse(shipped)).not.toThrow();
  });

  it("與程式裡的保險絲 DEFAULT_ITEM_CARD 一字不差", () => {
    const { note: _note, ...withoutNote } = shipped as Record<string, unknown>;
    expect(withoutNote).toEqual({ ...DEFAULT_ITEM_CARD });
  });

  it("49 支傳說武器裡的每一個 [標記] 都在表上 —— 沒有一個是靠預設分類矇過去的", () => {
    const table = new Set(Object.keys(DEFAULT_ITEM_CARD.markers));
    const inline = new Set(DEFAULT_ITEM_CARD.inlineValueMarkers);
    const missing: string[] = [];
    for (const id of poolIds) {
      const doc = descOf(id);
      for (const m of (doc.description ?? "").matchAll(/\[([^\]]+)\]/g)) {
        const tag = m[1]!;
        if (!table.has(tag) && !inline.has(tag)) missing.push(`${id} (${doc.name}): [${tag}]`);
      }
    }
    expect(missing, "這些標記沒有登記分類,卡片會用 unknownCategory 猜").toEqual([]);
  });

  it("每一支都解析得出至少一行效能 —— 沒有一張卡是空的", () => {
    const empty: string[] = [];
    for (const id of poolIds) {
      const doc = descOf(id);
      if (parseItemCard(doc.description).efficacy.length === 0) empty.push(`${id} (${doc.name})`);
    }
    expect(empty, "這些道具的卡片會畫出一片空白").toEqual([]);
  });

  it("解析前後的字一模一樣 —— 沒有吃掉任何一句,也沒有重複任何一句", () => {
    // 失敗形態:parser 悄悄吞掉一段文字,畫面只是「少了一句」,沒有人會發現。
    // 比對方式是把兩邊都攤平成「去掉空白與方括號的字元序列」:
    //   · 左邊 = 解析結果的每一個 token 的 text 接起來(chip 的字也算,它有畫出來);
    //   · 右邊 = 原文去掉段落標題行(`效能` / `效能：` / `解說` / `歷史`)與方括號。
    // 標題行本身不是內容(它變成了畫面上的分段),所以右邊要扣掉。
    const headings = new Set([
      ...DEFAULT_ITEM_CARD.efficacyHeadings,
      ...DEFAULT_ITEM_CARD.loreHeadings,
    ]);
    const lost: string[] = [];
    for (const id of poolIds) {
      const doc = descOf(id);
      const card = parseItemCard(doc.description);
      const got = [
        card.rarity ?? "",
        ...card.efficacy.map((l) => l.tokens.map((t) => t.text).join("")),
        ...card.lore,
      ]
        .join("")
        .replace(/\s/g, "");
      const want = (doc.description ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => !headings.has(l.replace(/[：:]\s*$/, "")))
        .join("")
        .replace(/[[\]]/g, "")
        .replace(/\s/g, "");
      if (got !== want) lost.push(`${id} (${doc.name})`);
    }
    expect(lost, "解析前後的字不一樣 —— 有文字被吃掉或被重複").toEqual([]);
  });
});

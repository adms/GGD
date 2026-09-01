/**
 * ⭐⭐ GH#912 —— 圖鑑要說出道具**真正的來源**。
 *
 * owner 2026-09-01：「好像都沒看到隨機這些道具」
 *
 * ⭐ 他的推論完全合理，⛔ 而它是被**錯誤的標籤**引導的：畫面上寫「任務獎勵」，
 * 而這個遊戲**沒有任何任務** ⇒ 合理結論是「這些永遠拿不到」。
 * ⚠️ 實際上那 9 件**每一場都抽得到**。
 *
 * ⭐ 這條守衛跑**出貨內容**（真的 `content/loot-tables/` ＋ 真的 `arena-rules.json`），
 * ⛔ 不是自造夾具 —— 失敗形態⑤：被測的不是出貨的那個。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `bucketOf` 裡「先問掉落表」那一條拿掉 → 🔴（9 件全部掉回 no-modifiers/quest-reward）
 *   · `liveLootItemIds` 改成收**所有** loot-tables（⛔ 不看 arena-rules 引用）→ ⚠️ **綠**
 *     ⭐ 誠實記下來：這條守衛**今天驗不到那件事** —— 出貨的三張表
 *     （`ex-origin-weapons` · `ex-release-weapons` · `legendary-weapons`）
 *     **全部**都被 `arena-rules.json` 引用著 ⇒ 兩種實作得到同一個集合。
 *     ⛔ 所以「只收活著的表」這條規則今天沒有量尺 —— 它會在**第一張退場的表**
 *     出現時才變得可驗，⭐ 而那正是它最需要說話的時候。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bucketOf, liveLootItemIds } from "./codexData";

const ROOT = resolve(__dirname, "../../../../..");

/** ⭐ 把出貨樹接成 codex 用的 `fetchFn`（⛔ 不碰網路）。 */
const shippedFetch = (async (url: string) => {
  const rel = url.replace(/^\/content\//, "");
  try {
    const body = readFileSync(resolve(ROOT, "content", rel), "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => null };
  }
}) as unknown as Parameters<typeof liveLootItemIds>[0];

describe("GH#912 圖鑑的道具來源", () => {
  it("★ ⭐ 出貨的抽選表反查得到，而**票文點名的 9 件都在裡面**", async () => {
    const ids = await liveLootItemIds(shippedFetch, "/content");
    expect(ids.size, "⛔ 一件都沒反查到 ⇒ 下面量的是空氣（儀器）").toBeGreaterThan(10);
    // 票文逐字點名的兩張表 —— ⭐ 從**出貨檔**取 id，⛔ 不在這裡抄一份清單。
    for (const table of ["ex-release-weapons", "ex-origin-weapons"]) {
      const doc = JSON.parse(
        readFileSync(resolve(ROOT, "content/loot-tables", `${table}.json`), "utf8"),
      ) as { entries: { itemId: string }[] };
      for (const e of doc.entries) {
        expect(
          ids.has(e.itemId),
          `⛔⛔ \`${e.itemId}\` 在 ${table} 裡（⇒ 每一場都抽得到），而反查說它不在\n` +
            `⇒ 圖鑑會退回用 \`cost\` 猜，而那正是「任務獎勵」那個謊的來源。`,
        ).toBe(true);
      }
    }
  });

  it("★ ⭐ 抽得到的道具標成**回合抽選**，⛔ 不是「任務獎勵」", async () => {
    const ids = await liveLootItemIds(shippedFetch, "/content");
    const doc = JSON.parse(
      readFileSync(resolve(ROOT, "content/loot-tables/ex-release-weapons.json"), "utf8"),
    ) as { entries: { itemId: string }[] };
    const sample = doc.entries[0]!.itemId;
    const got = bucketOf({ id: sample, cost: 0 }, ids);
    expect(got.bucket, `⛔ \`${sample}\` 抽得到，而圖鑑說它是 ${got.bucket}`).toBe("loot-drop");
  });

  it("⭐ ⛔ 這個遊戲**沒有任務** ⇒ `quest-reward` 只有文件明寫才會出現", () => {
    // ⚠️ `ex-release-weapons.json` 的 note 逐字：「『任務道具』是舊時代 DOTA 玩法的標籤，
    //   **競技場新玩法完全不考慮它**」。⇒ 推導不可以再產生這個 bucket。
    expect(bucketOf({ name: "四魂之玉", cost: 0 }).bucket).not.toBe("quest-reward");
    expect(bucketOf({ bucket: "quest-reward", cost: 0 })).toEqual({
      bucket: "quest-reward",
      source: "doc",
    });
  });
});

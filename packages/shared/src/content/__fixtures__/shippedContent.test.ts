/**
 * 單次載入夾具的閘 —— **兩條路必須逐份相同**。
 *
 * `shippedContent.ts` 讓 66 支 `ContentLoader` 測試與 50+ 支 `readdirSync` 測試
 * 改讀 `content/bundle.json`。那個改動只有在「bundle 那條路與檔案樹那條路吐出
 * **一模一樣的文件**」時才是合法的 —— 否則整批測試就變成在驗一份影子內容。
 *
 * ⚠️ 這一條**不是** `shippedBundleIsCurrent.test.ts` 的複本：
 *   那一條問「repo 裡 commit 的 bundle 是不是最新的」（版控，讀樹）；
 *   這一條問「**夾具**從 bundle 讀出來的東西，跟它自己從樹讀出來的一不一樣」
 *   （夾具本身正不正確）。夾具的排序、`_` 過濾、id↔檔名對應都住在這裡。
 *
 * 突變紀錄（一批一條，挑最承重的那一線）：
 *   `docsFromBundle` 的排序鍵從 `` `${a.id}.json` `` 改成 `a.id`
 *   → 第一條紅，訊息指名 `abilities` 第一個順序不同的位置。改回即綠。
 */
import { describe, it, expect } from "vitest";
import { stableStringify } from "../hash";
import { COLLECTION_NAMES } from "../schema/index";
import {
  __docsFromTreeForTest,
  shippedBundleIsFresh,
  shippedDocFiles,
} from "./shippedContent";

describe("出貨內容夾具", () => {
  it("★ bundle 那條路與檔案樹那條路，每一個集合逐份相同（id·順序·內容）", () => {
    // bundle 過期時夾具本來就走檔案樹，兩條路是同一條 ⇒ 這條測試沒有東西可比。
    // ⛔ 不 skip：跳過的測試看起來跟通過一樣。改成明說它在比什麼。
    const viaBundle = shippedBundleIsFresh();
    const drift: string[] = [];
    for (const collection of COLLECTION_NAMES) {
      const tree = __docsFromTreeForTest(collection);
      const fixture = shippedDocFiles(collection);
      if (tree.length !== fixture.length) {
        drift.push(`${collection}: 樹 ${tree.length} 份 / 夾具 ${fixture.length} 份`);
        continue;
      }
      for (let i = 0; i < tree.length; i++) {
        const a = tree[i]!;
        const b = fixture[i]!;
        if (`${a.id}.json` !== b.file) drift.push(`${collection}[${i}]: ${a.id} ≠ ${b.file}`);
        // ⚠️ `stableStringify`，⛔ 不是 `JSON.stringify`：bundle 是用它序列化的，
        // 所以 bundle 裡的文件**鍵是排序過的**，而磁碟上的是作者寫的順序。
        // 兩者是同一份文件（`hashDoc` 也是走 stableStringify —— 內容定址系統
        // 從第一天起就把它們當成同一份），差別只有鍵序與 `-0`↔`0`。
        else if (stableStringify(a.doc) !== stableStringify(b.doc)) {
          drift.push(`${collection}/${a.id}: 內容不同`);
        }
      }
    }
    expect(
      drift,
      `夾具（走 ${viaBundle ? "bundle" : "檔案樹"}）與檔案樹對不上 —— ` +
        `這代表整批改用夾具的測試在驗一份影子內容。\n  · ${drift.slice(0, 15).join("\n  · ")}`,
    ).toEqual([]);
  });

  it("★ 不是出貨那棵樹時退回 FsContentSource（temp 樹的測試行為必須不變）", async () => {
    const { shippedContentSource, SHIPPED_CONTENT_DIR } = await import("./shippedContent");
    const { FsContentSource } = await import("../node/FsContentSource");
    expect(shippedContentSource("/private/tmp/definitely-not-the-content-tree")).toBeInstanceOf(
      FsContentSource,
    );
    // 出貨樹 + bundle 新鮮 ⇒ 記憶體來源；bundle 過期 ⇒ 也是 FsContentSource（fail-slow）。
    const shipped = shippedContentSource(SHIPPED_CONTENT_DIR);
    expect(shipped instanceof FsContentSource).toBe(!shippedBundleIsFresh());
  });
});

/**
 * 退場的道具**不出現在任何現役產物裡** —— owner 2026-08-18 的那一條。
 *
 * > 「請把舊的備份轉移到 legacy 資料夾並附註在 index.md 上，**不應該再出現在現有
 * >   任何文件上**或**讓任何 script 浪費算力處理**（像製作書系列、合成過渡期道具
 * >   系列等已經沒上架的武器道具），**包括道具總表**，但**可附註 legacy 路徑供有
 * >   必要考古的話進一步查找**」
 *
 * ⭐ **判準是目錄，⛔ 不是名單。** 這支測試沒有、也不可以有一份「哪些 id 退場了」
 * 的常數：退場的定義就是「這份 JSON 躺在 `content/_legacy/items/`」。搬一件進去、
 * 搬一件出來，守衛自動跟上 —— 一份手抄名單會是第四個住處，而它必然過期。
 *
 * ⚠️ **bundle 那一條問的是「它是不是一份出貨文件」，⛔ 不是「文字裡有沒有這串 id」。**
 * 34 件出貨道具的 `item@1.recipe` 仍然指著退場的製作書與組件，而那是**對的**：
 * schema 自己寫著「GGD has no combine step; this is provenance only」，`CodexItem`
 * 根本不帶這一格（玩家看不到），所以它正是 owner 說的「可附註 legacy 路徑供考古」。
 * 逐字掃 bundle 會把這個**刻意保留的指標**誤判成洩漏 —— 所以掃的是 doc id。
 *
 * 這條紅了要做什麼：跑 `pnpm content:build && pnpm docs:reference && pnpm docs:readme`，
 * 然後 `git add content/ docs/ README.md`。⛔ 不要改這個測試。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const LEGACY_ITEMS = join(REPO, "content", "_legacy", "items");

/** 退場的道具 id —— 從**目錄事實**推導。 */
function retiredIds(): string[] {
  if (!existsSync(LEGACY_ITEMS)) return [];
  return readdirSync(LEGACY_ITEMS)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -".json".length));
}

/** 人在讀的現役文件（「道具總表」那一族）—— 這幾份逐字掃。 */
const HUMAN_DOCS = ["docs/固有能力及寶具總覽.md", "docs/reference/items.md", "README.md"];

describe("退場的道具不出現在任何現役產物裡（owner 2026-08-18）", () => {
  it("出貨 bundle / 索引 / 抽獎表都不再把它們當成一份文件", () => {
    const gone = new Set(retiredIds());
    // 空目錄會讓下面每一條斷言真空通過（失敗形態③），先釘住它有東西。
    expect(gone.size, "content/_legacy/items/ 空了 —— 知識不可以無聲消失").toBeGreaterThan(0);

    const bundle = JSON.parse(readFileSync(join(REPO, "content", "bundle.json"), "utf-8")) as {
      collections: Record<string, { entries: { id: string; doc?: { entries?: { itemId: string }[] } }[] }>;
    };
    const shipped = (bundle.collections["items"]?.entries ?? []).map((e) => e.id);
    expect(
      shipped.filter((id) => gone.has(id)),
      "出貨 bundle 還在送已退場的道具 —— 跑 pnpm content:build",
    ).toEqual([]);

    const index = JSON.parse(readFileSync(join(REPO, "content", "items", "_index.json"), "utf-8")) as {
      entries: { id: string }[];
    };
    expect(index.entries.filter((e) => gone.has(e.id)).map((e) => e.id)).toEqual([]);

    // 抽獎表是「拿得到」的另一半：一件在表上的道具就不是退場的。
    for (const t of bundle.collections["loot-tables"]?.entries ?? []) {
      const bad = (t.doc?.entries ?? []).map((e) => e.itemId).filter((id) => gone.has(id));
      expect(bad, `抽獎池 ${t.id} 排了已退場的道具`).toEqual([]);
    }
  });

  it("道具總表不列它們，但每一份都留著一行 legacy 指標（考古走得回去）", () => {
    const gone = retiredIds();
    for (const rel of HUMAN_DOCS) {
      const text = readFileSync(join(REPO, rel), "utf-8");
      const leaked = gone.filter((id) => text.includes(id));
      expect(leaked.slice(0, 8), `${rel} 仍然列著已退場的道具（共 ${leaked.length} 件）`).toEqual([]);
      // 「不出現」只做對一半：owner 同一句話要求**可附註 legacy 路徑供考古**。
      // 少了這一行，101 件東西就是靜靜地不見了 —— 那是這條規矩要防的事本身。
      expect(text, `${rel} 沒有指回 content/_legacy/items/ 的那一行`).toContain("content/_legacy/items/");
      expect(text, `${rel} 沒有指回 docs/legacy-index.md`).toContain("legacy-index.md");
    }
  });
});

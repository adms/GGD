/**
 * README 與 `docs/全英雄列表.md` 的「待上架」表，⛔ 不可以列出**卡已經在 `content/champions/`** 的英雄。
 * 一條**薄**守衛（文件層：⛔ 不開對抗輪）。
 *
 * ⭐ 2026-09-17 量到：待上架快照 `docs/_data/pending-heroes.json`（來源 repo 狀態頁的原樣副本，快照日 09-11）
 *   列 45 名，其中 **37 名的卡早就進了 `content/champions/`** —— 而 README 仍把 45 名全部印在
 *   「⛔ 還沒進 `content/champions/`」底下：同一名英雄在全英雄列表與待上架表各印一次，而且是一句假話。
 * ⇒ 產生器現在在算繪當下扣掉已進來的列（`tools/reference/gen_readme_lists.py` 的 `pending_heroes`）。
 *
 * ⚠️ 讀**出貨的兩份文件**，⛔ 不是掃產生器原始碼（失敗形態⑥）。
 * 突變：把那個扣除拿掉再跑 `pnpm docs:readme` ⇒ 這條紅（2026-09-17 驗過）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

/** 「待上架（N 名）」標題之後、下一個標題或產生區塊出處行之前，表格第二欄的追蹤鍵。 */
function pendingSection(file: string, heading: RegExp): { declared: number; ids: string[] } {
  const text = readFileSync(resolve(ROOT, file), "utf8");
  const m = text.match(heading);
  expect(m, `${file} 找不到「待上架（N 名）」標題 —— 表格形狀變了？`).not.toBeNull();
  const ids: string[] = [];
  for (const line of text.slice(m!.index! + m![0].length).split("\n").slice(1)) {
    if (/^#{1,5} /.test(line) || line.startsWith("*由 `pnpm docs:readme`")) break;
    const row = line.match(/^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|/);
    if (row) ids.push(row[1]!);
  }
  return { declared: Number(m![1]), ids };
}

describe("待上架表只列卡還沒進 content/champions/ 的英雄", () => {
  const inContent = new Set(
    readdirSync(resolve(ROOT, "content/champions"))
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => f.slice(0, -".json".length)),
  );
  const docs = [
    ["README.md", /^##### 待上架（(\d+) 名）.*$/m],
    ["docs/全英雄列表.md", /^## 待上架（(\d+) 名）.*$/m],
  ] as const;
  for (const [file, heading] of docs) {
    it(`★ ${file}`, () => {
      const { declared, ids } = pendingSection(file, heading);
      // ⭐ 先證明真的讀到表了：列數對不上標題 ⇒ 解析失敗，⛔ 不可以因為讀到 0 列就變綠。
      expect(ids.length, `${file}：標題寫 ${declared} 名，表格讀到 ${ids.length} 列`).toBe(declared);
      const landed = ids.filter((id) => inContent.has(id));
      expect(landed, `${file} 把卡已在 content/champions/ 的英雄印成「還沒進」⇒ 跑 \`pnpm docs:readme\` 然後 git add`).toEqual([]);
    });
  }
});

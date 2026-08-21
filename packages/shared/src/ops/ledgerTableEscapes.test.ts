/**
 * ⛔ 帳本表格的欄位要在**沒有被跳脫**的 `|` 上切。
 *
 * owner 2026-08-22：「GGD作戰版的一個表格好像格式跑掉了 時間 owner 說了什麼（逐字）」
 *
 * ⚠️ 根因不是「忘了跳脫」—— `scripts/ledger_table.py` 的 `cell()` **一直都有**
 * 把內容裡的 `|` 寫成 `\|`。壞的是**兩個讀端**（`ledger_table.cells()` 與
 * `tools/board/gen_board.py`）都用裸 `split("|")`，於是在跳脫字元上切開：
 * 一則內嵌 Markdown 表格的裁決，在作戰板上炸成十幾個 `<td>`，
 * 每一格結尾還掛著一個孤兒 `\`。
 *
 * ⛔ **沒有任何東西變紅** —— HTML 仍然合法，`board:build --check` 也綠，
 * 只是人讀不懂。這就是第二守則失敗形態③（可以壞掉而測試全綠）。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function cells(line: string): string[] {
  // ⭐ 真的把出貨的那支 python 跑起來，⛔ 不是在 TS 裡重寫一份規則
  //（重寫的那一份不會跟著 ledger_table.py 一起改，＝ 第四個住處）。
  const out = execFileSync(
    "python3",
    [
      "-c",
      [
        "import sys; sys.path.insert(0, 'scripts')",
        "from ledger_table import cells",
        "import json; print(json.dumps(cells(sys.argv[1])))",
      ].join("\n"),
      line,
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  return JSON.parse(out) as string[];
}

describe("帳本表格的跳脫", () => {
  it("⭐ 內嵌 Markdown 表格的裁決仍然只有三欄", () => {
    const r = cells(String.raw`| 00:40 | 前言 \| 來源 \| 數量 \| 尾巴 | #479 |`);
    expect(r).toHaveLength(3);
    expect(r[0]).toBe("00:40");
    expect(r[2]).toBe("#479");
    // ⭐ 跳脫要被**還原**成真的直線 —— ⛔ 不可以留下孤兒反斜線
    expect(r[1]).toBe("前言 | 來源 | 數量 | 尾巴");
    expect(r[1]).not.toContain("\\");
  });

  it("⭐ 普通的三欄列不受影響", () => {
    expect(cells("| 21:30 | 一般內容 | #500 |")).toEqual(["21:30", "一般內容", "#500"]);
  });
});

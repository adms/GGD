/**
 * 戰情版(md) 被改過就要有留底 —— ⭐ 而 hook 對**檔案 API 直寫**是瞎的。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼（owner 2026-08-30：「寫入戰情版前 都會自動備份對吧？」）
 * ---------------------------------------------------------------------------
 * ⛔ **當時的答案是「沒有」。** 量到的：
 *
 * | 檔 | `_ledger.tsv` 裡的筆數 |
 * |---|---:|
 * | `docs/_release/ggd-board.html`（產生器**自己叫**留底）| **10** |
 * | `docs/_execution-batches.md`（我用 python 改了 5+ 次）| **1** |
 *
 * ⭐ 根因與 `gen_board.py` 那次**一模一樣**：`preserve-before-overwrite.py` 只攔
 * **Write／Edit／shell 重導**，⛔ 對 `Path.write_text()` / `writeFileSync` **結構上失明**。
 *
 * ⇒ ⭐ 修法不是「記得備份」（判準），是給那條路一支工具（`scripts/preserve.sh`）
 * 並讓 `bmpndd.sh` 的 M 步**自動叫它**。
 *
 * 突變紀錄：把 `bmpndd.sh` 裡那一行 `preserve.sh` 拿掉 ⇒ 這條紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("戰情版(md) 的寫入端會留底（owner 2026-08-30）", () => {
  it("⭐ `bmpndd.sh` 的 M 步在動戰情版**之前**叫 preserve", () => {
    const src = readFileSync(join(REPO, "scripts/bmpndd.sh"), "utf-8");
    const preserve = src.indexOf("preserve.sh");
    const board = src.indexOf("_execution-batches.md");
    expect(preserve, "⛔ `bmpndd.sh` 沒有叫 `scripts/preserve.sh` —— hook 對檔案 API 直寫是瞎的").toBeGreaterThan(0);
    expect(
      preserve > board,
      "⛔ preserve 要在**認得 BOARD 之後**、動它之前 —— 順序錯了就備份到別的東西",
    ).toBe(true);
  });

  it("⭐ `preserve.sh` 兩條路都在：git 乾淨只記帳 · 有改動才真的複製", () => {
    const src = readFileSync(join(REPO, "scripts/preserve.sh"), "utf-8");
    expect(src, "⛔ 少了「git 裡有乾淨的一份就只記帳」⇒ legacy 會被重複備份灌爆").toContain("SKIP(git 有)");
    expect(src, "⛔ 沒有真的複製 ⇒ 那不是備份").toContain("cp -p");
    expect(src, "⛔ 沒有記進同一本帳 ⇒ 下一輪查不到它備份過").toContain("_ledger.tsv");
  });
});

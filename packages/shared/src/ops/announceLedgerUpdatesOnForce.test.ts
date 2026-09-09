import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **補發之後，帳本還寫著被取代掉的那一句。**
 *
 * 2026-09-09 量到：帳本的寫入端一律是「這一列不在 ⇒ 追加」，⛔ 從來不**更新**。
 * ⇒ 一次 `GGD_ANNOUNCE_FORCE=1` 的補發把**真的內容**發了出去，
 *   ⛔ 而第三欄留著罐頭句子 ⇒ ⭐ 下一個讀帳本的人會得出
 *   「那一版本來就沒有玩家可見的改動」——**而那正是這次補發要推翻的結論**。
 *
 * ⚠️ 兩個方向都要驗，⛔ 一邊不算：
 *   ① 補發（force）⇒ **更新**那一列，⛔ 而且不長出第二列
 *   ② 平常（非 force）⇒ ⛔ **不覆寫**（⭐ 這一條證明①不是「一律覆寫」換來的）
 */

const REPO = join(import.meta.dirname, "../../../..");
const TOOL = join(REPO, "tools/release/ledger_merge.py");
const OLD = "v1.0.0\t2026-01-01\t系統優化更新：穩定性與速度的例行維護。\n";

function run(force: "0" | "1", content: string, tags: string[]): string {
  const p = join(mkdtempSync(join(tmpdir(), "ggd-led-")), "_announced.tsv");
  writeFileSync(p, OLD);
  execFileSync("python3", [TOOL, p, "2026-09-09", content, force, ...tags], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 30_000,
  });
  return readFileSync(p, "utf8");
}

describe("公告帳本：補發要**更新**那一列（owner 2026-09-09 那一輪量到）", () => {
  it("① 補發 ⇒ 換成真的那一句，⛔ 而且**不長出第二列**", () => {
    const out = run("1", "商店裡的三階寶具現在會直接寫「不在貨架上」", ["v1.0.0"]);
    expect(out, "⛔ 帳本還在說那句被取代掉的話").toContain("不在貨架上");
    expect(out).not.toContain("系統優化更新");
    expect(out.trim().split("\n")).toHaveLength(1);
  });

  it("② 平常 ⇒ ⛔ 不覆寫（⭐ 證明①不是「一律覆寫」換來的）", () => {
    const out = run("0", "一句新的話", ["v1.0.0"]);
    expect(out, "⛔ 非補發也覆寫了 —— 那會把歷史吃掉").toContain("系統優化更新");
    expect(out).not.toContain("一句新的話");
  });

  it("③ 新版號照舊追加（⛔ 這條路沒有被動到）", () => {
    const out = run("0", "第二版的一句話", ["v1.0.0", "v1.0.1"]);
    const rows = out.trim().split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain("v1.0.1");
    expect(rows[0]).toContain("系統優化更新");
  });
});

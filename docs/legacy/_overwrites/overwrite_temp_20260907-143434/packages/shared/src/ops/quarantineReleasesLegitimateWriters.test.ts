/**
 * 🔒 **隔離區只鎖「沒有合法寫入端」的那一半**（GH#1097）。
 *
 * ⭐ 病的形狀是 GH#707 的第 N 次：一份知識（「誰擁有這個檔」）有多個消費端，
 *   而 genguard／hook 從 GH#1096 起已經改問「**這幾個位元組**是不是產物」，
 *   ⛔ 隔離區還在問「這個**檔**是不是產物」⇒ 它把整份 chmod 444。
 *   ⇒ 「hook 說可以改」與「檔案是唯讀」**一起是綠的**，只有真的去寫才會發現。
 *
 * 2026-09-07 量到的兩類誤鎖：
 *   · **部分產物**（marker 拼接）：`README.md`（2,075 行裡只有 9 段是 `docs:readme` 的）
 *     與 `docs/效果標籤詞彙表v2.md`
 *   · **追加式帳本**：`docs/legacy/_overwrites/_ledger.tsv` —— `board:build` 只是
 *     `open("a")` 追加一列，⛔ 不是作者，而 `scripts/preserve.sh` 的 `>>` 因此靜靜失敗，
 *     結尾照樣印「✓ 留底 N 份」（⭐ 壞掉跟正常長得一模一樣）。
 *
 * ⭐ 兩個方向都要驗，⛔ 只驗「可寫」那一邊對「全部都不鎖」也是綠的。
 *
 * 突變紀錄（2026-09-07 實跑）：把 `product-quarantine.sh` 的 `is_partial()` 改成
 * 永遠 `return False`（＝修復前的行為）→ ① 紅，指名部分產物被鎖走。改回來。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, closeSync, mkdtempSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 真的開檔 —— ⛔ 不是 `os.access`：守的正是「檔案 API 直寫」那條路。"a" 不截斷、不寫位元組。 */
function probe(p: string): "WRITABLE" | "EACCES" {
  try {
    closeSync(openSync(p, "a"));
    return "WRITABLE";
  } catch {
    return "EACCES";
  }
}

describe("隔離區：有合法寫入端的檔不上鎖（GH#1097）", () => {
  it("① 兩個方向：部分產物 lock 之後可寫 · 整份產物仍然 EACCES", () => {
    const dir = mkdtempSync(join(tmpdir(), "pq1097-"));
    const partial = join(dir, "partial.md");
    const whole = join(dir, "whole.json");
    writeFileSync(
      partial,
      "人寫的散文\n<!-- BEGIN GENERATED:roster -->\n表\n<!-- END GENERATED:roster -->\n更多散文\n",
    );
    writeFileSync(whole, "{}\n");
    chmodSync(partial, 0o444); // ⭐ 先鎖住：要驗 lock **主動放行**，⛔ 不是「跳過」
    const io = join(dir, "io.json");
    writeFileSync(
      io,
      JSON.stringify({
        steps: [
          // ⭐ 真的步驟名 —— 判準要一路推導到 package.json → gen_readme_lists.py 裡的
          //   `BEGIN GENERATED:` 字面值（⛔ 不是一張「哪些檔是部分產物」的名單）。
          { name: "docs:readme", writes: [partial] },
          { name: "fake:build", writes: [whole] }, // 不是 marker 拼接器 ⇒ 整份是產物
        ],
      }),
    );
    execFileSync("bash", ["scripts/product-quarantine.sh", "lock"], {
      cwd: REPO,
      env: { ...process.env, GGD_QUARANTINE_IO: io },
    });
    expect(probe(partial), "部分產物被整份鎖走 ⇒ hook 說可以改而散文改不動（GH#1097）").toBe("WRITABLE");
    expect(statSync(partial).mode & 0o200, "lock 要**主動放行**（444→644），⛔ 不是跳過").not.toBe(0);
    expect(probe(whole), "整份產物沒鎖上 ⇒ 隔離區失效（owner 記錄過上百次的通道）").toBe("EACCES");
    chmodSync(whole, 0o644);
  });

  it("② 真的用合法寫入端寫：preserve.sh 記得進 444 的帳本，出貨那一本也可寫", () => {
    const dir = mkdtempSync(join(tmpdir(), "pq1097-led-"));
    const led = join(dir, "_ledger.tsv");
    writeFileSync(led, "seed\n");
    chmodSync(led, 0o444); // ⭐ 就是 2026-09-07 那一刻的狀態
    execFileSync("bash", ["scripts/preserve.sh", "docs/__gh1097_probe__"], {
      cwd: REPO,
      encoding: "utf8",
      env: { ...process.env, GGD_PRESERVE_LOG: led },
    });
    expect(readFileSync(led, "utf8"), "⛔ 寫入端沒有自解鎖 ⇒ 備份存在磁碟上而帳本查不到它").toContain(
      "SKIP(不存在)",
    );
    // ⭐ 出貨態：真的那一本現在也開得起 append（⛔ 不寫位元組 —— 併行 lane 會把髒檔掃上車）
    expect(
      probe(join(REPO, "docs/legacy/_overwrites/_ledger.tsv")),
      "出貨的帳本仍是 444 ⇒ 跑 `bash scripts/product-quarantine.sh lock`",
    ).toBe("WRITABLE");
  });
});

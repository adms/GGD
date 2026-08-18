/**
 * 下載來的 CC0 場景模型，**帳本與磁碟必須雙向對得起來**。
 *
 * ⚠️ 為什麼是雙向的（單向那一半是真的會發生的事）：
 *  · 帳本有、磁碟沒有 ⇒ arena doc 引用一個 404，玩家看到**空氣**（fail-open 不會叫）
 *  · 磁碟有、帳本沒有 ⇒ 一件**沒有授權證明**的二進位檔混進 repo。
 *    這正是這個目錄與 `content/assets/models/scenery/` 的差別：那 15 件是生成的
 *    （「不存在的來源不需要證明」），這裡每一件都下載自第三方，⛔ 少一列就是少一份證明。
 *
 * ⭐ 第三條驗的是**出貨的位元組**，不是帳本上的宣稱（失敗形態⑤）：真的把
 * `normalize.ts --check` 跑起來，量每一件的世界 bbox 最低點。`zDecor` 沒有 `y`，
 * 所以沒座地的模型在 GGD 裡**無法補救**，只會陷進地板（失敗形態①）。
 *
 * 突變紀錄（2026-08-18）：帳本刪掉 `christmas__Fence.glb` 那一列 → ①紅（磁碟多一件）。
 *
 * ⛔ 它紅了不要改這個檔案 —— 補帳本那一列，或跑
 *     npx tsx tools/scenery-cc0/normalize.ts
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIR = join(ROOT, "content/assets/models/scenery-cc0");
const LEDGER = join(DIR, "PROVENANCE.md");
const SCRIPT = join(ROOT, "tools/scenery-cc0/normalize.ts");

/** 完整 sha256 區塊：`<file>` / `  upstream <64>` / `  local <64>`。 */
function ledgerRows(): Map<string, string> {
  const out = new Map<string, string>();
  const text = readFileSync(LEDGER, "utf8");
  const re = /^(\S+\.glb)\n\s+upstream ([0-9a-f]{64})\n\s+local\s+([0-9a-f]{64})$/gm;
  for (const m of text.matchAll(re)) out.set(m[1]!, m[3]!);
  return out;
}

describe("scenery-cc0 下載素材的帳本", () => {
  it("⭐ 帳本 ↔ 磁碟**雙向**對齊，而且每一件的位元組就是帳本記的那一份", () => {
    expect(existsSync(LEDGER), "PROVENANCE.md 不見了 —— 這批模型沒有授權證明").toBe(true);
    const ledger = ledgerRows();
    const disk = readdirSync(DIR).filter((f) => f.endsWith(".glb")).sort();
    expect(ledger.size, "帳本一列都沒解析到 —— sha256 區塊的格式被改過了").toBeGreaterThan(0);

    const missingOnDisk = [...ledger.keys()].filter((f) => !disk.includes(f)).sort();
    expect(missingOnDisk, "帳本有、磁碟沒有：arena 引用它會拿到 404").toEqual([]);

    const unledgered = disk.filter((f) => !ledger.has(f));
    expect(unledgered, "磁碟有、帳本沒有：一件沒有授權證明的二進位檔").toEqual([]);

    const tampered = disk.filter(
      (f) => createHash("sha256").update(readFileSync(join(DIR, f))).digest("hex") !== ledger.get(f),
    );
    expect(tampered, "檔案內容與帳本記的 sha256 不符 —— 有人換掉了位元組").toEqual([]);
  });

  it("⭐ 每一件都座在 y=0（讀出貨的位元組，⛔ 不是讀帳本）", () => {
    expect(existsSync(SCRIPT), "normalize.ts 不見了 —— 這條守衛在測空氣").toBe(true);
    let code = 0;
    let out = "";
    try {
      out = execFileSync("npx", ["tsx", SCRIPT, "--check"], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    expect(
      code,
      "有模型沒座地。zDecor 沒有 y 欄位 ⇒ 它會陷進地板而且畫面上看不出來。" +
        "⛔ 不要改這條測試 —— 跑 `npx tsx tools/scenery-cc0/normalize.ts`。腳本說：" + out.trim(),
    ).toBe(0);
  });
});

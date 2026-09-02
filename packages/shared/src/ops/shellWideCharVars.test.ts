/**
 * ⭐⭐ **`$VAR` 後面不可以緊接全形字** —— 在 `set -u` 的腳本裡那是一顆定時炸彈。
 *
 * ⛔⛔ 2026-09-02 實際踩到:`scripts/genrun.sh:100` 逐字是
 *     `echo "✗✗ genrun: … 失敗（exit $RC）—— …"`
 * ⭐ 而這個 locale 下 bash 把全形右括號的第一個 byte **收進了變數名**
 * ⇒ `RC）: unbound variable`。
 *
 * ⚠️⚠️ ⭐ **而它只在「產生器失敗」那條路徑上跑** ——
 * ⇒ ⭐ 它專門在你**最需要看到錯誤訊息**的那一刻，把訊息換成一個無關的 shell 錯誤。
 * 那一次它蓋掉的是 `content:build` 的 Zod 驗證失敗（三個欄位名逐一指出來的那一段），
 * ⭐ 而我因此多繞了三輪才看到真正的原因。
 *
 * ⇒ ⭐ 修法是 `${RC}`（明確界定），⛔ 不是「記得不要把全形字貼在變數後面」。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../scripts");
/** ⭐ `$NAME` 緊接一個非 ASCII byte —— ⛔ 不含 `${...}` / `$(...)` / `$1`。 */
const TRAP = /\$[A-Za-z_][A-Za-z0-9_]*(?=[^\x00-\x7F])/;

describe("shell 腳本：`$VAR` 後面緊接全形字", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sh"));

  it("⭐ 量尺先自證：真的掃到腳本了", () => {
    expect(files.length, "⛔ 一支都沒掃到 ⇒ 這條在量空氣").toBeGreaterThan(10);
  });

  it("★★ ⭐ 跑 `set -u` 的腳本裡**一處都不可以有**", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(DIR, f), "utf8");
      if (!/^\s*set\s+-[a-z]*u/m.test(src)) continue; // ⛔ 沒有 set -u 的不會炸
      src.split("\n").forEach((line, i) => {
        if (TRAP.test(line)) bad.push(`${f}:${i + 1}  ${line.trim().slice(0, 80)}`);
      });
    }
    expect(
      bad,
      "⛔ 這幾行在 `set -u` 下會變成 `unbound variable`，" +
        "⭐ 而且多半只在**錯誤路徑**上跑 ⇒ 它會蓋掉你真正要看的訊息。" +
        "\n→ 改成 `${VAR}`。",
    ).toEqual([]);
  });
});

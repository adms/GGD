/**
 * ⭐【`pnpm test` 不可以在第一個紅的套件就停下來】—— GH#322 的閘。
 *
 * 症狀：`pnpm -r --if-present test` 預設是 **bail** —— 第一個非零離開的套件就中止
 * 整串，後面的套件**一次都沒跑**。2026-08-13 實測：`apps/admin` 紅了 10 條，
 * 於是 `tools/w3x-import`（1 條）、`apps/client`（29 條）、`apps/game-server`
 * （6 條）**全部沒有被執行**，而終端最後印的是 admin 那 10 條 ——
 * 看起來像「還有 10 條要修」，真相是 46 條。
 *
 * ⛔ 這不是「測試寫錯」，是**回報管道自己**在說謊：修好第一個套件之後，
 *    下一個紅的套件才浮出來，於是每一輪都只看得到冰山的一角，
 *    而每一輪都以為自己快好了。
 *
 * ⚠️ 它跟第零守則⑦（測試預算）不衝突：`--no-bail` **不會多跑任何一條測試**
 *    —— 本來就要跑的那些，只是不再被前一個套件的離開碼吃掉。
 *
 * 突變紀錄：把 package.json 的 `--no-bail` 拿掉 → 這一條紅並指名那個 script。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("根目錄的 pnpm test / typecheck 會跑完每一個套件（GH#322）", () => {
  it("⭐ 兩個 script 都帶 --no-bail —— ⛔ 少了它，後面的套件的紅燈會被靜默吞掉", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const name of ["test", "typecheck"]) {
      const cmd = pkg.scripts[name] ?? "";
      expect(cmd, `根目錄沒有 ${name} script`).toContain("pnpm -r");
      expect(
        cmd,
        `\`pnpm ${name}\` 少了 --no-bail：第一個紅的套件會中止整串，` +
          `後面的套件一次都不跑，而終端只印得出第一個套件的錯 —— ` +
          `這正是 GH#322 讓 36 條紅燈隱形了不知道多久的那個機制。`,
      ).toContain("--no-bail");
    }
  });
});

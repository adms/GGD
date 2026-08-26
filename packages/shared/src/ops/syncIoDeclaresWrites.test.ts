/**
 * 🏠 **戶籍表（sync-io.json）要宣告得出每一支產生器的產物** —— GH#771。
 *
 * ## 這條閘在關哪一個洞（2026-08-26 一天三次 EACCES 的根）
 * `sync-io.json` 的 `writes` 是**量出來的下界**，⛔ 但全系統（genguard / hook /
 * 隔離區 / genrun）把它當成**擁有權**。一支「內容不同才寫」的條件寫入端在已收斂
 * 的樹上量到 0 寫 ⇒ 戶籍 0 ⇒ `genrun.sh <它>` 解鎖 0 份 ⇒ 單獨跑必吃 EACCES ⇒
 * 有人補「寫入端自解鎖」（治症狀）⇒ 隔離區失去意義。⭐ 這條閘讓「宣告 0 產物的
 * 產生器」**當場紅**，⛔ 不是等下一次 EACCES。
 *
 * ## 為什麼豁免表可以存在
 * 有一族步驟真的只讀不寫（roster:check 那類純檢查）。豁免要帶**能被反駁的理由**，
 * 而且理由裡要說得出「它為什麼不寫」。⭐ 表只能變短。
 *
 * ── 突變紀錄（一批一條）──────────────────────────────────────────────────
 *  · 把 `tools/speed-growth/gen.ts` 檔頭的 `// ggd:writes …` 拿掉並重跑 merge
 *    → 它的 writes 變空 → 這條紅：「speedtiers:build 宣告 0 份產物」。
 *    （merge 側同型突變已驗：拿掉 staticWrites 收割 → speedtiers writes=[]。）
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const IO = JSON.parse(
  readFileSync(join(REPO, "tools/parallel-gates/sync-io.json"), "utf8"),
) as { steps: Array<{ name: string; writes: string[]; readCount: number }> };

/** 真的只讀不寫的步驟 —— 每一列要有一個能被反駁的理由。⭐ 只能變短。 */
const READ_ONLY_BY_DESIGN: Record<string, string> = {
  "quarantine:unlock": "chmod 不是「寫檔」—— 它改的是權限位，mtime 差分本來就量不到，也不該量到",
  "quarantine:lock": "同上",
  "roster:check": "名字就是 :check —— 它是唯讀對帳，寫了東西才是缺陷",
};

describe("戶籍表宣告完整性 (sync-io-declares-writes)", () => {
  it("⭐ 每一支會寫檔的步驟都宣告得出至少一份產物（0 宣告 = 下一次 EACCES 已上膛）", () => {
    const zero = IO.steps
      .filter((s) => (s.writes ?? []).length === 0)
      .filter((s) => READ_ONLY_BY_DESIGN[s.name] === undefined)
      .map((s) => s.name);
    expect(
      zero.join(" · "),
      `⛔ ${zero.length} 支步驟在戶籍表裡宣告 0 份產物。兩條路：\n` +
        `①它真的會寫 ⇒ 在它的原始碼檔頭加 \`// ggd:writes <glob>\`（merge-io 收割），` +
        `或重量測 sync-io（bash /private/tmp/remeasure.sh 的形狀）\n` +
        `②它真的只讀 ⇒ 進 READ_ONLY_BY_DESIGN 並寫出「它為什麼不寫」。\n` +
        `⚠️ 宣告 0 的下場：genrun 解鎖 0 份 ⇒ 單獨跑吃 EACCES ⇒ 有人補自解鎖 ⇒ 隔離區失去意義。`,
    ).toBe("");
  });

  it("readCount 大而 writeCount 0 的不對稱步驟，一定在豁免表裡（它是「少宣告」的可判定訊號）", () => {
    const sus = IO.steps
      .filter((s) => (s.writes ?? []).length === 0 && (s.readCount ?? 0) > 50)
      .filter((s) => READ_ONLY_BY_DESIGN[s.name] === undefined)
      .map((s) => `${s.name}(讀 ${s.readCount})`);
    expect(sus.join(" · "), "讀很多寫零 —— 極可能是條件寫入端被量測漏掉").toBe("");
  });

  it("sentinel：豁免表裡沒有幽靈步驟名（表只能指向真的步驟）", () => {
    const names = new Set(IO.steps.map((s) => s.name));
    const ghosts = Object.keys(READ_ONLY_BY_DESIGN).filter((n) => !names.has(n));
    expect(ghosts.join(" · "), "豁免表指向不存在的步驟 = 一句看起來有防的散文").toBe("");
  });
});

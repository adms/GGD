/**
 * ⛔ **`docs/kill-bounty.md` 的 SUPERSEDED 標頭不可以自己過期。**
 *
 * #735 給那份 doc 掛上標頭，逐條寫出「doc 說什麼 / 出貨其實是什麼」。⚠️ 而那個標頭
 * 本身是**散文**：`GOLD_REWARDS.killBounty` 哪天從 100 改成別的，標頭就變成第三守則
 * 說的那種「被散文守著、過了保存期限而沒有任何東西變紅」的宣稱 —— 而它的用途正是
 * 「以後有人來讀，讓他知道現行規則是什麼」。⇒ 這一條把那個標頭關進閘裡（GH#774）。
 *
 * ⭐ 它**不抄字面值**（第〇·四守則：那會是第四個住處）—— 出貨值一律從 `GOLD_REWARDS`
 * 讀；測試只知道「標頭宣稱的 key(值) 必須等於出貨值」這個**關係**。
 * ⚠️ 紅了⛔ 不要改這條測試：去把 doc 標頭那一格的數字改成新的出貨值。
 *
 * 突變（2026-08-27）：`GOLD_REWARDS.killBounty` 100 → 150 ⇒ 紅，訊息指名
 * `docs/kill-bounty.md:14` 那一行與「doc 說 100 / 出貨是 150」。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GOLD_REWARDS } from "../sim/economy/progression";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DOC = "docs/kill-bounty.md";

/** 標頭 = 檔案開頭那一段連續的 `>` 引言塊（#735 掛上去的那一段）。 */
function supersededHeader(text: string): { line: number; body: string }[] {
  const out: { line: number; body: string }[] = [];
  const lines = text.split("\n");
  let seen = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    if (raw.startsWith(">")) {
      seen = true;
      out.push({ line: i + 1, body: raw });
    } else if (seen && raw.trim() === "") continue;
    else if (seen) break;
  }
  return out;
}

/**
 * 標頭裡「宣稱出貨值」的兩種寫法（⭐ 都在 code fence 裡，所以錨得住）：
 *   `kill`(150)   ← 「現行規則 vs doc」那張表
 *   `kill: 150`   ← 「出貨位置」那張表
 */
const CLAIM_RE = /`(\w+)`\((\d+)\)|`(\w+):\s*(\d+)`/g;

describe("kill-bounty.md 的 SUPERSEDED 標頭 vs 出貨的 GOLD_REWARDS", () => {
  it("⛔ 標頭宣稱的每一個金額都要等於出貨常數", () => {
    const header = supersededHeader(readFileSync(join(ROOT, DOC), "utf8"));
    const claims: { line: number; key: string; said: number }[] = [];
    for (const { line, body } of header) {
      for (const m of body.matchAll(CLAIM_RE)) {
        const key = m[1] ?? m[3] ?? "";
        const said = Number(m[2] ?? m[4]);
        if (key in GOLD_REWARDS) claims.push({ line, key, said });
      }
    }
    // 夾具前提：一條都撈不到 = 這條守衛永遠綠（失敗形態③）。
    expect(
      claims.length,
      `${DOC} 的 SUPERSEDED 標頭裡撈不到任何 GOLD_REWARDS 金額宣稱 —— ` +
        "要嘛標頭被改寫了（請把錨改成新的寫法），要嘛它被刪了（那 #735 的知識就沒了）。",
    ).toBeGreaterThanOrEqual(2);

    const stale = claims
      .filter((c) => c.said !== (GOLD_REWARDS as Record<string, number>)[c.key])
      .map(
        (c) =>
          `${DOC}:${c.line} 說 GOLD_REWARDS.${c.key} = ${c.said}，` +
          `而出貨是 ${(GOLD_REWARDS as Record<string, number>)[c.key]}`,
      );
    expect(
      stale.join("\n"),
      "SUPERSEDED 標頭的用途是「告訴讀者現行規則是什麼」，它一旦過期就比沒有標頭更危險。\n" +
        "→ 出貨值住 packages/shared/src/sim/economy/progression.ts 的 GOLD_REWARDS；\n" +
        "→ 把 doc 標頭那一格改成新的數字。⛔ 不要改這條測試。\n",
    ).toBe("");
  });
});

/**
 * ⭐【交付索引頁列的每一個檔案，都必須真的在那裡】
 *
 * 症狀（2026-08-14 稽核）：`docs/_codex-handoff.md` 的「建議給」那一格指向
 * `docs/_w3x-fidelity-superseded.md` —— **檔案不在那裡**。它在 2026-08-13 被
 * `c24fc429` 整批搬去 `docs/legacy/`，而索引頁沒跟著改。
 *
 * ⛔ 這種爛連結**不會在本地被發現**：索引頁是給人照著「把這幾個檔寄出去」用的，
 *    寄的人找不到就是**默默少寄一份**，而收到的人不知道自己少了什麼。
 *    第〇章第 3–5 層的具體範例（哪些原作數值被新版取代、誰在哪天裁的）就這樣消失。
 *
 * ⚠️ 它跟 `codexContractFresh.test.ts` 是**兩件事**，⛔ 不要合併：
 *      · contract-fresh —— 合約**內容**（能力指紋）有沒有過期
 *      · 這一條         —— 交付**清單**指的檔案還在不在
 *    第一條紅代表引擎變了，第二條紅代表檔案搬家了。
 *
 * ⭐ 範圍刻意只有「repo 內的相對路徑」：外部 URL 不驗（驗它會讓測試上網），
 *    程式碼片段裡的 `<content-api prefix>/…` 也不是檔案。
 *
 * 突變紀錄：把索引頁任一條 markdown 連結的路徑改錯一個字 → 這一條紅並印出那一行。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const HANDOFF = join(REPO, "docs", "_codex-handoff.md");
const DOCS = join(REPO, "docs");

/** markdown 連結目標，只留 repo 內的相對路徑。 */
function repoLinks(md: string): { line: number; target: string }[] {
  const out: { line: number; target: string }[] = [];
  md.split("\n").forEach((l, i) => {
    for (const m of l.matchAll(/\]\(([^)\s]+)\)/g)) {
      const raw = m[1]!;
      if (/^(https?:|mailto:|#)/.test(raw)) continue;
      out.push({ line: i + 1, target: decodeURIComponent(raw) });
    }
  });
  return out;
}

describe("Codex 交付索引頁沒有爛連結（GH#323 稽核）", () => {
  it("⭐ 每一個 repo 相對路徑都真的存在 —— ⛔ 少寄一份不會有人發現", () => {
    const md = readFileSync(HANDOFF, "utf8");
    const links = repoLinks(md);
    // ⛔ 零筆 = 有人把清單改成純文字了，這條就變成空跑。
    expect(links.length, "索引頁一條 markdown 連結都沒有 —— 清單還在嗎？").toBeGreaterThan(4);

    const broken = links.filter(({ target }) => !existsSync(normalize(join(DOCS, target))));
    expect(
      broken,
      "索引頁指到不存在的檔案。⛔ 不要改這條測試 —— 檔案搬家了就改索引頁：\n" +
        broken.map((b) => `  · 第 ${b.line} 行 → ${b.target}`).join("\n"),
    ).toEqual([]);
  });

  it("必給的三份，一份都不能少", () => {
    const md = readFileSync(HANDOFF, "utf8");
    // 這三份是「沒有它就開不了工」的，所以除了路徑存在，還要**被列在這一頁上**。
    for (const must of [
      "技能編輯器引擎須知 20260811.md",
      "英雄技能第一批重製-90支.md",
      "skill-tag-manifest.json",
    ]) {
      expect(md, `必給清單裡少了 ${must}`).toContain(must);
      expect(
        existsSync(join(REPO, must)) || existsSync(join(DOCS, must)),
        `${must} 被列在必給清單上，但檔案不存在`,
      ).toBe(true);
    }
  });
});

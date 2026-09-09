import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⭐⭐ **五道界線矩陣**（GH#1150 AC①）—— owner 2026-09-08 逐字：
 *
 * > 「檔案存在 · GLB 轉換成功 · 已標準化入庫 · 遊戲畫面驗收 · 正式發布
 * >   —— 五件事分別確認。⛔ 一件成立**不蘊含**下一件」
 *
 * ⚠️ ⭐ 這條守的是**那張表不可以說謊**，⛔ 不是「37 名做完了沒」。
 *   ⭐ 一張手填的 37×5 表，每一格都是一句散文 —— 而本 repo 記過五次
 *   「一句活過保存期限的散文，⛔ 而沒有東西變紅」。
 */

const REPO = join(import.meta.dirname, "../../../..");
const OUT = join(REPO, "docs/_reports/batch2-37-boundaries.md");

describe("第二批 37 名的五道界線矩陣（GH#1150 AC①）", () => {
  const md = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";

  it("⭐ 量尺先自證：表在，而且真的有 37 列", () => {
    expect(md.length, "⛔ 矩陣不見了").toBeGreaterThan(500);
    const rows = md.split("\n").filter((l) => /^\| *\d+ *\| `b2-/.test(l));
    expect(rows).toHaveLength(37);
  });

  it("⛔ 它是**產物** —— 檔頭要說得出誰擁有它", () => {
    expect(md.split("\n")[0]).toContain("tools/batch2-boundaries/gen.mjs");
  });

  // ⛔⛔ **2026-09-09 更正：這一欄在此之前量的是另一件事。**
  //   舊版斷言「⑤ ＝ content/champions/ 裡有幾張 b2-*」。⭐ 而實測落過一名之後
  //   名單閘說：「上架就把 id 加進 starter.go 的 starterChampions」——
  //   ⇒ ⭐ 那是**全體玩家的起始名單**，⛔ 不是社群房。
  //   社群英雄真正的發布路是投稿發布流程（`publishsubmission.go` ＋ `communityRoomOnly`
  //   ＋ `applyContentPool()`），它落在**平台 overlay**，⛔ 不在 git 裡。
  // ⇒ 這一欄現在誠實地是 `?`，⭐ 而這條守衛守的是**它不可以假裝知道**。
  it("⭐⭐ 「正式發布」欄 ⛔ 不可以假裝知道 —— 它要問平台 overlay，而產生器讀不到", () => {
    const tally = /\| ⑤正式發布 \| (\d+) \| (\d+) \| (\d+) \|/.exec(md);
    expect(tally, "⛔ 合計那一列不見了").not.toBeNull();
    const [yes, no, unknown] = [Number(tally![1]), Number(tally![2]), Number(tally![3])];
    expect(
      { yes, no },
      "⛔ 這一欄宣稱知道答案 —— 而它讀不到平台 overlay（⭐ ✅ 是說謊，⛔ 是誣告）",
    ).toEqual({ yes: 0, no: 0 });
    expect(unknown, "⛔ 37 列都要有這一格").toBe(37);
    expect(md, "⛔ 表上要寫得出**為什麼**是 `?`").toContain("平台 overlay");
  });

  // ⭐⭐ ④「畫面驗收」那一欄要對得上**逐條驗過**的收據 —— ⛔ 不是一個手填的勾。
  it("⭐ 「畫面驗收」那一欄 ＝ screen-verification.json 裡 ok 的那幾顆", () => {
    const p = join(REPO, "docs/_reports/batch2-37-bodies/screen-verification.json");
    const okCount = existsSync(p)
      ? Object.values(
          (JSON.parse(readFileSync(p, "utf8")) as { bodies: Record<string, { ok: boolean }> }).bodies,
        ).filter((r) => r.ok).length
      : 0;
    const tally = /\| ④畫面驗收 \| (\d+) \| (\d+) \| (\d+) \|/.exec(md);
    expect(tally, "⛔ 合計那一列不見了").not.toBeNull();
    expect(
      Number(tally![1]),
      "⛔ 表上的『畫面驗收』與逐條驗過的收據對不上 ⇒ 那張表在說謊",
    ).toBe(okCount);
  });

  it("⭐ 每一格都是**量到的**：⛔ 不可以留白（留白讀起來像「不適用」）", () => {
    const bad = md
      .split("\n")
      .filter((l) => /^\| *\d+ *\| `b2-/.test(l))
      .filter((l) => l.split("|").slice(3, 8).some((c) => c.trim() === ""));
    expect(bad, "⛔ 這幾列有空格子").toEqual([]);
  });
});

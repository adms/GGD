import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * ⭐⭐ GH#244 —— **JASS 行為類 ↔ 出貨模板** 的對照表不可以過期。
 *
 * ── ⛔ 為什麼它必須是產生的 ────────────────────────────────────────────────
 * 票文要「全 JASS 掃描 → **模板總類表** → UI 編輯器 → 併入後台」。
 * ⚠️ 一張**手寫**的總類表會立刻過期：`content/ability-templates/` 每加一支、
 * 每有一支技能套上模板，那張表就少一列真相 —— ⛔ 而沒有任何東西會叫。
 *
 * ── ⭐⭐ 而它真正的價值是那個**排序** ──────────────────────────────────────
 * 「下一批模板該做哪一類」按**擋住幾支**排 —— 第〇·五守則逐字：
 * 「⭐ **按擋住的支數做機制，⛔ 不是按技能順序做技能**」。
 * ⇒ 今天量到：召喚代理 **19** · 變身強化 · 衝鋒推撞 …（116 支沒套模板）
 *
 * ── ⚠️ join key 的教訓 ────────────────────────────────────────────────────
 * ⭐ key 是**技能編號**（`90-00`），⛔ 不是 rawcode。
 * 2026-08-31 拿 rawcode 量到「309 支只對上 **1** 支」——
 * ⭐ 而那個 1 讀起來完全像個合理的答案（⛔ 它是量尺瞎了）。
 */
const REPO = resolve(__dirname, "../../../..");

describe("GH#244 JASS 模板對照表", () => {
  it("★ ⭐ `--check` 是綠的（紅了不要改測試：跑 `node tools/jass-template-map/gen.mjs`）", () => {
    const out = execFileSync("node", ["tools/jass-template-map/gen.mjs", "--check"], {
      cwd: REPO, encoding: "utf8", timeout: 120_000,
    });
    expect(out).toContain("新鮮的");
  });

  it("⭐ 量尺自證：join key 對得上**一大批**，⛔ 不是個位數", () => {
    const md = execFileSync("cat", ["docs/editor-contract/jass-template-map.md"], {
      cwd: REPO, encoding: "utf8",
    });
    const m = /對得上出貨 ability 的（join key ＝ \*\*技能編號\*\*） \| \*\*(\d+)\*\*/.exec(md);
    expect(m, "⛔ 讀不到那一格 ⇒ 這條斷言在測空氣").not.toBeNull();
    expect(
      Number(m![1]),
      "⛔ 對得上的只有個位數 ⇒ 幾乎一定是 join key 又被換成 rawcode 了（2026-08-31 踩過）",
    ).toBeGreaterThan(50);
  });
});

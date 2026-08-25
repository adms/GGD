/**
 * GH#706 —— revive 效果的 fallback ↔ 出貨 `arena-rules.json` 的 drift 閘。
 *
 * `REVIVE_EFFECT_FALLBACK_*` 的註解承諾「Deliberately EQUAL to the shipped
 * arena-rules numbers」，而它在 2026-08-25 之前引用的兩支守衛從未存在。
 * 兩邊漂移的下場：跳過復活圈的那條路（技能 revive、骨架開機）用一個
 * 沒有人裁決過的第二份平衡意見。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REVIVE_EFFECT_FALLBACK_HP_PCT, REVIVE_EFFECT_FALLBACK_MANA_PCT } from "./revive";

const SHIPPED = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../content/config/arena-rules.json",
);

describe("revive fallback —— 出貨的那一份 (revive-fallback-shipped)", () => {
  it("fallback 兩格逐位元等於出貨 arena-rules 的 reviveHp/ManaPctMax", () => {
    const doc = JSON.parse(readFileSync(SHIPPED, "utf8")) as {
      reviveCircles?: { reviveHpPctMax?: number; reviveManaPctMax?: number };
    };
    const rc = doc.reviveCircles;
    expect(rc, "出貨 arena-rules 沒有 reviveCircles 區塊 —— 這條閘在測空氣").toBeDefined();
    expect(REVIVE_EFFECT_FALLBACK_HP_PCT, "HP fallback 與出貨值漂移").toBe(rc!.reviveHpPctMax);
    expect(REVIVE_EFFECT_FALLBACK_MANA_PCT, "mana fallback 與出貨值漂移").toBe(rc!.reviveManaPctMax);
  });
});

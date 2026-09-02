/**
 * ⭐⭐ **04-03 龍破斬的 +180% AP 是「碎片增幅後」才吃的**（GH#936）。
 *
 * owner 2026-09-02 逐字：
 * > 「#10 龍破斬：卡面說「碎片增幅後 +180%AP」，⛔ 而 1.8×AP 是**常駐**的，不需要碎片
 * >  => 碎片是 EX 施展得到的增幅狀態，可以做條件偵測增幅 AP 傷害，開票」
 *
 * ⭐ 機制（`ratios[].when`）是這張票做的；⛔ 而**內容一直沒有採用它** ——
 * 也就是第一·五守則的形狀：卡面說了一個前提，而遊戲裡那個前提不存在。
 *
 * ⭐ 條件用 `recentCast`（GH#937 的條件葉）：「碎片增幅後」＝**最近施放過 EX**，
 * `withinSec: 6` ＝ 04-002 那一發 `applyBuff` 的 `duration`（⛔ 不是挑的數字）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 04-03 的兩份鏡射（本體＋變身態）。 */
const MIRRORS = ["godie-h020.e", "godie-hjai.e"];

describe("龍破斬的條件式係數（GH#936）", () => {
  it("★★ ⭐ 兩份鏡射的 1.8×AP **都帶著條件**（⛔ 常駐＝卡面說謊）", () => {
    for (const id of MIRRORS) {
      const s = readFileSync(join(ROOT, `content/abilities/${id}.json`), "utf8");
      const d = JSON.parse(s) as unknown;
      const ratios: { stat?: string; coeff?: number; when?: unknown }[] = [];
      const walk = (o: unknown): void => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (!o || typeof o !== "object") return;
        const r = o as { stat?: string; coeff?: number };
        if (r.stat === "ap" && r.coeff === 1.8) ratios.push(o as never);
        for (const v of Object.values(o)) walk(v);
      };
      walk(d);
      expect(ratios.length, `⛔ ${id} 找不到那條 1.8×AP —— 係數改了就回來改這條`).toBeGreaterThan(0);
      // ⭐⭐ 問的是「**有沒有一筆**帶條件的 1.8」，⛔ 不是「每一筆 1.8 都帶條件」。
      //
      // ⚠️ ⭐ 在此之前這裡是 `for (const r of ratios) expect(r.when)` —— **每一筆都要**，
      //   ⇒ 而 04-03 龍破斬的**平時**係數剛好也是 1.8
      //   （`tools/ap-conversion` 從 w3x 換算來的，⭐ 那一筆是對的）
      //   ⇒ ⛔ 守衛把一份**正確**的內容判成紅。
      //
      // ⭐ 語意（04-002 碎片卡面逐字：「龍破斬及神滅斬**增加**傷害(180% [AP])」）：
      //   增幅是一條**額外**加上去的係數，⛔ 不是取代平時那一條
      //   ⇒ 引擎把 `ratios` 相加 ⇒ 神滅斬平時 1.3、增幅後 1.3+1.8=3.1 ✅
      const gated = ratios.filter((r) => (r as { when?: unknown }).when);
      expect(
        gated.length,
        `⛔ ${id} 的 1.8×AP **全部是常駐**的 —— 而卡面逐字寫著「碎片增幅後」\n` +
          "  ⭐ 那條增幅要帶 `when`，⛔ 否則玩家沒放 EX 也吃得到",
      ).toBeGreaterThan(0);
    }
  });

  it("⭐ 條件是 `recentCast EX`，而窗口對得上 04-002 的 buff 長度", () => {
    const s = readFileSync(join(ROOT, "content/abilities/godie-h020.e.json"), "utf8");
    const m = /"when":\s*\{[^}]*\}/.exec(s);
    expect(m, "⛔ 那個 when 不見了").toBeTruthy();
    const when = JSON.parse(m![0].slice(m![0].indexOf("{"))) as Record<string, unknown>;
    expect(when.kind).toBe("recentCast");
    expect(when.slot, "⛔ 碎片是 EX 給的").toBe("EX");
    // ⭐ 6 秒不是挑的：04-002 惡夢魔王的碎片那一發 applyBuff 的 duration
    const ex = JSON.parse(
      readFileSync(join(ROOT, "content/abilities/godie-h020.ex.json"), "utf8"),
    ) as { effects?: { kind?: string; duration?: number }[] };
    const buff = (ex.effects ?? []).find((e) => e.kind === "applyBuff");
    expect(
      when.withinSec,
      "⛔ 窗口與碎片 buff 的長度對不上 ⇒ 兩個住處會各自漂",
    ).toBe(buff?.duration);
  });
});

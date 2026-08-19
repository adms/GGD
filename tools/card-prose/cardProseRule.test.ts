/**
 * 卡面文案規則的**薄守衛**（GH#461，體驗層 ⇒ 一條線、⛔ 不開對抗輪）。
 *
 * ⭐ 它只釘四件「刪掉那一行整個功能就消失」的事，⛔ 不釘任何出貨數值
 * （級距表住 `content/config/*-tiers.json`，那裡已經有 drift 守衛）。
 */
import { describe, expect, it } from "vitest";
import { applyCardProseRule } from "./cardProseRule";

const GEO = { range: "中", radius: "小", raw: { range: 6, radius: 4.5 } } as const;

describe("卡面文案規則", () => {
  it("幾何換級距詞，級距來自**引擎**而不是文案上那個數字", () => {
    // 文案寫 14（GGD 單位）而引擎是 6 ⇒ 必須落在引擎那一格
    const r = applyCardProseRule("[主動]\n施法距離14\n\n打人。", GEO);
    expect(r.next).toContain("施法距離：中");
    expect(r.next).not.toContain("14");
  });

  it("引擎沒有那一軸 ⇒ ⛔ 不改寫，只留一筆待判斷", () => {
    const r = applyCardProseRule("對500範圍內敵人造成傷害。", { raw: {} });
    expect(r.next).toContain("500範圍");
    expect(r.findings.map((f) => f.rule)).toEqual(["geo-no-engine-value"]);
  });

  it("冷卻／耗魔整行拿掉，⛔ 不留一行空白（含逐階斜線串）", () => {
    const r = applyCardProseRule(
      "[主動][範圍]\n60/50/40/30秒冷卻\n消耗MP150/250/350/450\n有效半徑6\n\n打人。",
      GEO,
    );
    expect(r.next).toBe("[主動][範圍]\n有效半徑：小\n\n打人。");
  });

  it("「」台詞與（GGD 註記）**一個字都不動**", () => {
    const src = "「在35秒後宣布勝利吧」\n\n（GGD 註記 2026-08-11）範圍 24 內的敵人。";
    expect(applyCardProseRule(src, GEO).next).toBe(src);
  });

  it("⛔ 不把傷害與倍率誤讀成幾何（回溯誤報）", () => {
    const a = applyCardProseRule("造成大範圍2500點傷害。", GEO);
    const b = applyCardProseRule("幫助周圍單位加速移動1.5倍。", { travel: "大", raw: {} });
    expect(a.next).toBe("造成大範圍2500點傷害。");
    expect(b.next).toBe("幫助周圍單位加速移動1.5倍。");
  });
});

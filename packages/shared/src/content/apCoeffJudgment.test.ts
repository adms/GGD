/**
 * apCoeffJudgment.test.ts —— 公式**讀標籤的那一層**判得對（owner 2026-09-06 逐字：
 * 「請你重新用公式判斷 看是不是判斷錯了來校正」）。
 *
 * ⭐ 那一天量到的不是 14 支各自標籤打錯，是**四個系統性誤判**（公式常數一格沒動）：
 *   ① 冷卻表是**文件**的事：以節點判 ⇒ 36 個範圍技的 AP 節點查到單體表（14-00 召喚式神 極小＝6s，而它的冷卻是範圍·極小 30s）
 *   ② 形狀看**祖先**：只看文件頂層 `radius` ⇒ 13-04 龍星群住在 `randomArea>damageArea(r3)` 底下卻被判成單體
 *   ③ 掛 `onBasicAttack` 的節點每下普攻都觸發 ⇒ 冷卻乘數是**下限**（計畫書 §2），⛔ 不是那支 buff 的 60 秒（15-02 疾風迅雷 22.7×）
 *   ④ 條件**逐條 ratio** 判、看得到 EX 槽位：04-03 龍破斬同一節點裡恆真那條與綁 EX 增幅那條不同級；12-002 仙氣發勁 EX ⇒ 大
 *
 * 全部拿**出貨文件**問 `apCoeffRowsOf`（載入層／報表／棘輪共用的那一支）；斷言對**設定表**，⛔ 不抄數字。
 * 突變（靈魂層，一條承重）：`apCoeffShapeOf` 的祖先迴圈只看 node 自己 ⇒ ② 紅。
 */
import { describe, it, expect } from "vitest";
import { readdirSync as _rdTpl } from "node:fs";
import { resolveTemplateExpansion } from "./templates/resolve";
import { zTemplateDoc, type TemplateDoc } from "./schema/template";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { apCoeffRowsOf, apCoeffTerms, comboStrikeCountsFrom, effectiveHits, DEFAULT_AP_COEFFICIENT } from "./apCoefficient";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

// ⭐ 2026-09-07（#993 第三批）：76 支技能的 AP 節點住在 template.params 裡 ⇒ 先用出貨那一支展開器攤開再問 apCoeffRowsOf。
const TEMPLATES_FOR_AP = new Map<string, TemplateDoc>(
  _rdTpl(join(ROOT, "content/ability-templates"))
    .filter((f) => f.startsWith("tpl-") && f.endsWith(".json"))
    .map((f) => {
      const t = zTemplateDoc.parse(JSON.parse(readFileSync(join(ROOT, "content/ability-templates", f), "utf8")));
      return [t.id, t] as const;
    }),
);
function expandedForAp(doc: Record<string, unknown>): Record<string, unknown> {
  if (doc["template"] === undefined) return doc;
  const res = resolveTemplateExpansion(doc, TEMPLATES_FOR_AP);
  return res.ok ? (res.merged as Record<string, unknown>) : doc;
}
const cd = JSON.parse(readFileSync(join(ROOT, "content/config/cooldown-tiers.json"), "utf8")) as {
  seconds: Record<string, Record<string, number>>;
};
const ct = JSON.parse(readFileSync(join(ROOT, "content/config/cast-time-tiers.json"), "utf8")) as {
  seconds: Record<string, number>;
};
const combo = comboStrikeCountsFrom(
  JSON.parse(readFileSync(join(ROOT, "content/config/combo-strikes.json"), "utf8")),
);
const rowsOf = (id: string) =>
  apCoeffRowsOf(
    expandedForAp(JSON.parse(readFileSync(join(ROOT, `content/abilities/${id}.json`), "utf8")) as Record<string, unknown>),
    cd,
    DEFAULT_AP_COEFFICIENT,
    ct,
    combo,
  );

describe("AP 係數公式的判斷層（owner 2026-09-06「重新用公式判斷」）", () => {
  it("① 冷卻表是文件的事：範圍技的 AP 節點查範圍表（中位 60），⛔ 不是單體表", () => {
    const [row] = rowsOf("godie-etyr.passive");
    expect(row!.inputs.midCooldownSec, "⛔ 14-00 召喚式神查到單體表的中位").toBe(cd.seconds["範圍"]!["中"]);
    expect(row!.inputs.cooldownSec, "⛔ 極小在範圍表是 30s，⛔ 不是單體的 6s").toBe(cd.seconds["範圍"]!["極小"]);
  });

  it("② 形狀看祖先：住在 randomArea>damageArea 底下的節點是範圍，半徑是那個 damageArea 的", () => {
    const [row] = rowsOf("godie-efur.r");
    expect(row!.ancestors.map((a) => a["kind"]), "夾具前提：13-04 龍星群的 AP 住在容器底下").toEqual(["randomArea", "damageArea"]);
    expect(row!.inputs.shape, "⛔ 龍星群被判成單體 —— 祖先的 damageArea 沒被看到").toBe("area");
    expect(row!.inputs.radiusUnits).toBe(row!.ancestors[1]!["radius"]);
  });

  it("③ 掛普攻 hook 的節點：冷卻乘數是下限，⛔ 不是那支 buff 的極大", () => {
    const [row] = rowsOf("godie-emfr.w");
    expect(row!.ancestors.some((a) => a["on"] === "onBasicAttack"), "夾具前提：15-02 疾風迅雷的 AP 掛在普攻上").toBe(true);
    expect(apCoeffTerms(row!.inputs)["cooldown"], "⛔ 普攻 proc 吃到了 60 秒大招的冷卻乘數").toBe(DEFAULT_AP_COEFFICIENT.cooldown.min);
  });

  it("④ 條件逐條 ratio 判、EX 槽位算大：龍破斬兩條不同級，仙氣發勁 ⇒ 大", () => {
    const rows = rowsOf("godie-h020.e");
    const plain = rows.find((r) => r.ratio["when"] === undefined)!;
    const gated = rows.find((r) => r.ratio["when"] !== undefined)!;
    expect(plain.inputs.conditionTier, "⛔ 恆真那一條被節點上另一條的 when 拖成有條件").toBe("極小");
    expect(gated.inputs.conditionTier, "⛔ 綁 EX 增幅（惡夢碎片）那一條不是大").toBe("大");
    expect(gated.value).not.toBe(plain.value);
    const [ex] = rowsOf("godie-e007.ex");
    expect(ex!.inputs.conditionTier, "⛔ EX 技沒有算成計畫書 §1.4 的「大·EX／需蓄積」").toBe("大");
    expect(ex!.inputs.castTimeSec, "⛔ castTimeTier 沒被翻成秒（owner 09-02：吟唱降為 0.2 ⇒ 小）").toBe(ct.seconds["小"]);
  });

  it("⑤ 發數（owner 2026-09-06「多段技的發數維度」）：龍星群 10 顆、超究每段＋收尾，每一發只拿 1/有效發數", () => {
    const [meteor] = rowsOf("godie-efur.r");
    expect(meteor!.inputs.hits, "⛔ randomArea.count 沒被讀成發數").toBe((meteor!.ancestors[0]!["count"] as number[])[0]);
    const [finisher] = rowsOf("godie-hart.r");
    expect(finisher!.inputs.hits, "⛔ 連段的發數要是家族每段數 + 1 收尾").toBe(combo["superff7"]! + 1);
    const t = apCoeffTerms(meteor!.inputs);
    expect(t["multiHit"], "⛔ 第七維沒有除以有效發數").toBeCloseTo(
      1 / effectiveHits(meteor!.inputs.hits!, DEFAULT_AP_COEFFICIENT.multiHit.decayPerHit), 9);
    const [single] = rowsOf("godie-n01g.q");
    expect(apCoeffTerms(single!.inputs)["multiHit"], "⛔ 單發技不該被除").toBe(1);
  });
});

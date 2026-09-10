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
import { apCoeffLogicalNodesOf, apCoeffRowsOf, apCoeffTerms, comboStrikeCountsFrom, dotPayoutsOf, effectiveHits, DEFAULT_AP_COEFFICIENT, resolveApCoeffOnDocWithTiers } from "./apCoefficient";
import { zEffectDef } from "./schema/effect";

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

  it("⑥ `hitOncePerTarget` ⇒ 發數是 **1** —— ⛔ 不是容器的 count（34-04 蒼龍破）", () => {
    // ⭐ 第七維問的是「一次施放打**同一個人**幾下」，⛔ 不是「這個容器結算幾次」。
    //   34-04 的 12 段是**空間上往前推**的行進波：`delayed.ts:332` 在 `hitOncePerTarget` 時
    //   建一個 `struck` 集合把重複的人剔掉（守衛 `sim/effects/travelingWaveAdvance.test.ts`），
    //   而 `tpl-traveling-wave` 自己的說明逐字寫著「同一個人整串只吃一次」。
    // ⛔ 不看這一格 ⇒ 係數被除以 12 ⇒ 0.7 → 0.0275（0.04×），全庫最大的一個偏離。
    const [wave] = rowsOf("godie-osam.r");
    const container = wave!.ancestors.find((a) => a["kind"] === "delayed")!;
    expect(container["hitOncePerTarget"], "夾具前提：34-04 展開後的容器真的宣告一人一次").toBe(true);
    expect(Number(container["count"]), "夾具前提：而它確實有 12 段").toBeGreaterThan(1);
    expect(wave!.inputs.hits, "⛔ 行進波被當成 12 連擊 ⇒ 每一發只拿 1/12").toBe(1);
    expect(apCoeffTerms(wave!.inputs)["multiHit"], "⛔ 第七維把一人一次的波動除掉了").toBe(1);
    // ⭐ 反方向：同一支容器**沒有**這一格時仍然要除（⛔ 否則這條在量「第七維被關掉了」）。
    const [combo9] = rowsOf("godie-hapm.ex");
    expect(combo9!.ancestors.some((a) => a["kind"] === "delayed" && a["hitOncePerTarget"] === undefined)).toBe(true);
    expect(combo9!.inputs.hits, "⛔ 真的九連擊沒被除 ⇒ 第七維整個沒在跑").toBeGreaterThan(1);
  });

  it("⑦ `dot` 進得了發數維度 —— 判準是「產生幾次傷害事件」，⛔ 不是「它叫什麼名字」（GH#1102）", () => {
    // ⭐ `apCoeffHitsOf` 在 2026-09-07 之前只認得 randomArea / delayed / comboStrikes
    //   ⇒ ⛔ 一段「每秒燒 N 跳」的 `amountPerTick` 拿的是**一次施放**的整份係數，而它會付 N 次。
    // ⚠️ 同族前科（GH#1024）：`delayed{count:12}` 帶 `hitOncePerTarget` 被**多**算成 12 發 ——
    //   那一次是多算，這一次是**沒算**，⛔ 而兩者都不會有任何東西紅。
    const burn = rowsOf("godie-ogld.w").find((r) => r.ancestors.some((a) => a["kind"] === "dot"));
    expect(burn, "夾具前提：這一支有一條 AP 住在 dot 底下").toBeDefined();
    const dot = burn!.ancestors.find((a) => a["kind"] === "dot")!;
    // ⭐ 期待值從**節點自己**推導（`floor(duration/interval)` ＋ tickOnApply 那一發），⛔ 不抄字面值。
    const payouts =
      Math.max(1, Math.floor(Number(dot["durationSec"]) / Number(dot["intervalSec"]))) +
      (dot["tickOnApply"] === true ? 1 : 0);
    expect(payouts, "夾具前提：它真的付不只一次").toBeGreaterThan(1);
    expect(dotPayoutsOf(dot), "⛔ 付款次數算錯了").toBe(payouts);
    expect(
      burn!.inputs.hits,
      `⛔ dot 的付款次數沒進第七維 ⇒ 每一跳都拿整份係數。受影響的 8 支（14 條 ap ratio）：` +
        "godie-ogld.w(10 跳) · godie-o030.e／godie-orkn.e(7) · godie-h02r.passive／godie-hgam.passive／godie-huth.r(5) · " +
        "godie-h02u.e／godie-h02v.e(3)",
    ).toBe(payouts);
    expect(apCoeffTerms(burn!.inputs)["multiHit"]).toBeCloseTo(
      1 / effectiveHits(payouts, DEFAULT_AP_COEFFICIENT.multiHit.decayPerHit), 9);
    // ⭐ 反方向：**不是** dot 的單發技一發都不可以被除（⛔ 否則這條在量「第七維被打開了」）。
    const [single] = rowsOf("godie-n01g.q");
    expect(single!.ancestors.some((a) => a["kind"] === "dot"), "反方向前提：這一支沒有 dot").toBe(false);
    expect(single!.inputs.hits, "⛔ 沒有多段容器的節點被除了").toBe(1);
  });

  it("⑧ 走訪走得進 `passive` —— 92 個普攻 hook 的家（GH#1102）", () => {
    // ⭐ 全庫 97 個 `onBasicAttack` hook 有 **92 個住 `passive`** ⇒ ⛔ 在此之前公式的普攻分支
    //   只服務得到 5 個（5.2%）。⚠️ 而那個盲點會**獎勵錯誤的修法**：把一支技能改成純被動，
    //   它的 AP 節點就直接離開母體 ⇒ 離群值「消失」了（GH#1100 第一版因此被退掉）。
    const rows = rowsOf("godie-ucrl.w"); // 06-02 山形修煉：AP 住 passive.ranks[].hooks[onBasicAttack]
    expect(rows.length, "⛔ 一條都沒走到 ⇒ `passive` 不在走訪根裡").toBeGreaterThan(0);
    const r = rows[0]!;
    expect(r.ancestors.some((a) => a["on"] === "onBasicAttack"), "夾具前提：它掛在普攻上").toBe(true);
    // ⭐ 而且它真的吃到了普攻分支（判準③）：冷卻乘數走**下限**，⛔ 不是那支 buff 的極大。
    expect(apCoeffTerms(r.inputs)["cooldown"], "⛔ 住 passive 的普攻 proc 吃到了大招的冷卻乘數")
      .toBe(DEFAULT_AP_COEFFICIENT.cooldown.min);
  });
});

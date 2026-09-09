/**
 * ⭐⭐ **AP 係數六維公式**（GH#942）。
 *
 * ## ⭐ 承重的那一條：**校準真的成立**
 *
 * `base` 不是挑的 —— 它是**解出來**的：
 * 全庫 154 個帶 `ratios` 的節點，公式算出來的幾何平均要等於**現況**的幾何平均。
 * ⇒ ⭐ 這一條就是「總量守恆」那句話的**可執行版本**。
 *
 * ⚠️⚠️ ⛔ **計畫書寫的 `0.225` 是五維的值** —— owner 2026-09-02 逐字補了第六維
 * （「有時候技能本身如果**基礎傷害低**，我也會用**高 AP/AD 加成來彌補**」），
 * 而他同一則警告「⛔ **不可以直接乘上去**」。
 * ⇒ ⭐ 直接沿用 0.225 會讓全庫**通膨將近一倍**（眾數 `小` 佔 87 個節點，補償 1.3×）。
 * ⇒ 這一條會在那種情況下**紅**。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_AP_COEFFICIENT,
  resolveApCoeff,
  apCoeffTerms,
  apCoeffInputsFrom,
  apCoeffRowsOf,
  apCoeffLogicalNodesOf,
  apRankArrayKeys,
  apRatioRootKeys,
  apFormulaDomainKeys,
  isApFormulaDomain,
  comboStrikeCountsFrom,
} from "./apCoefficient";
import { resolveTemplateExpansion } from "./templates/resolve";
import { zTemplateDoc, type TemplateDoc } from "./schema/template";
import { resolveConditionTier } from "./conditionTiers";
import type { SkillTierName } from "./skillTiers";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ABIL = join(ROOT, "content/abilities");

/**
 * ⭐⭐ **校準的母體必須是 runtime 真的服務的那一個 —— 展開後**（2026-09-07）。
 *
 * `registries.ts:245` 逐字是 `withProse(withTiers(expandIfTemplated(d)), x)`
 * ⇒ ⭐ **展開在前、AP 求值在後**。而這一支在此之前掃的是**磁碟上的原檔**：
 * 191 支帶 `template` 的技能，它們的 AP 節點住在 `template.params` 裡
 * ⇒ ⛔ **從普查裡整批消失**（186 條 → 91 條）。
 *
 * ⚠️ ⭐ 而消失的不是隨機的一半：那 95 條的係數系統性偏低
 * ⇒ 剩下的 91 條把「現況幾何平均」抬到 0.7843（展開後其實是 0.6919）
 * ⇒ 校準比從 1.019 變成 0.925 ⇒ ⭐ 它會叫人把 `base` 校到 **0.1783**，
 *   而那是**對一個 runtime 不存在的母體**校準出來的數字。
 *
 * ⇒ ⭐ 「今天漂了 −7.5%」**不是公式歪了，是分母被換掉了**
 *   （CLAUDE.md：一個統計要先問「這一欄的分母是什麼」）。
 * ⛔ 這也是為什麼上一輪把 `base` 調成 0.1783 會把 `apps/editor` 的
 *   `forgeRealCast` 弄紅 —— 那條紅燈是**真的**，它在說「這個 base 太大了」。
 *
 * 姊妹兩支（`apCoeffJudgment` / `apCoeffDeviation`）2026-09-07 已經改成展開後，
 * ⭐ 只有這一支落在後面 ⇒ 三條閘量的是**兩個不同的母體**。
 */
const TEMPLATES_FOR_AP = new Map<string, TemplateDoc>(
  readdirSync(join(ROOT, "content/ability-templates"))
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
const cdTiers = JSON.parse(
  readFileSync(join(ROOT, "content/config/cooldown-tiers.json"), "utf8"),
) as { seconds: Record<string, Record<string, number>> };


/** ⭐ 出貨的每一條 `ap` ratio，配上它的六個輸入 —— 走 `apCoeffRowsOf`（載入層／報表／棘輪同一支，⛔ 不再自己抄一份冷卻查表）。 */
const castTiers = JSON.parse(
  readFileSync(join(ROOT, "content/config/cast-time-tiers.json"), "utf8"),
) as { enabled?: boolean; seconds?: Record<string, number> };
const comboCounts = comboStrikeCountsFrom(
  JSON.parse(readFileSync(join(ROOT, "content/config/combo-strikes.json"), "utf8")),
);
const samples = readdirSync(ABIL)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .flatMap((f) => {
    const d = expandedForAp(JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Record<string, unknown>);
    return apCoeffRowsOf(d, cdTiers, DEFAULT_AP_COEFFICIENT, castTiers, comboCounts)
      .filter((row) => typeof row.ratio["coeff"] === "number" && (row.ratio["coeff"] as number) > 0)
      .map((row) => ({ id: String(d["id"]), inputs: row.inputs, coeffs: [row.ratio["coeff"] as number] }));
  });

const gm = (xs: readonly number[]): number =>
  Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length);

describe("AP 係數六維公式（GH#942）", () => {
  it("⭐ 儀器：出貨真的有這些節點（⛔ 否則校準那條在量空氣）", () => {
    // ⭐ 2026-09-07 第三次修正：門檻 150 → **200**（GH#1102）。母體 186 → **254 條**（171 支），
    //   因為走訪從「一行 `walk(def.effects)`」改成**從 schema 推導**（`apRatioRootKeys()`）
    //   ⇒ 住 `passive` 的 67 條與住 `toggle` 的 1 條進來了。
    // ⭐ 這個門檻現在同時守**兩個**會靜默失效的步驟：
    //   · 走訪根掉回只剩 `effects` ⇒ 186 ⇒ 紅
    //   · 模板展開靜默失效（`expandedForAp` 直接回 doc）⇒ 150 ⇒ 紅
    // ⚠️ 上一次寫的是「分母變小了 ⇒ 把門檻調下來」，⛔ 而那是**接受了一個錯的分母**。
    expect(samples.length, "⛔ 節點數掉回舊母體的量級 ⇒ 走訪根或模板展開有一個沒生效").toBeGreaterThan(200);
    expect(samples.flatMap((s) => s.coeffs).length).toBeGreaterThan(200);
  });

  it("⭐⭐ 走訪的**根**從 schema 推導 —— ⛔ 不是一份手寫的「還要走哪幾格」", () => {
    // ⭐ GH#1102 —— ⛔ 在此之前這裡是一行 `walk(def["effects"])`：
    //   全庫 97 個 `onBasicAttack` hook 有 **92 個住 `passive`** ⇒ 公式的普攻分支只服務得到 5 個。
    const roots = apRatioRootKeys();
    // 正方向：schema 上真的有 `ratios` 的容器都要在（⛔ 不抄字面清單 —— 對 `zAbilityDef` 的 shape 問）。
    expect(roots, "⛔ `effects` 不在走訪根裡 ⇒ 整條公式在量空氣").toContain("effects");
    expect(roots, "⛔ `passive` 不在走訪根裡 ⇒ 92 個普攻 hook 看不到（GH#1102）").toContain("passive");
    // ⭐ 反方向：`template` **不可以**在裡面 —— 那是**展開前**的來源（`params` 是 `z.unknown()`），
    //   runtime 讀的是展開後的 `effects` ⇒ 兩邊都算 = 同一條 ratio 被數兩次（94 條）。
    expect(roots, "⛔ `template` 進了走訪根 ⇒ 模板技的 AP 節點會被數兩次").not.toContain("template");
    // ⭐ 而且它真的**走到**了：出貨裡確實有 ap ratio 住在 `effects` 以外。
    const outsideEffects = readdirSync(ABIL)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .reduce((n, f) => {
        const d = expandedForAp(JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Record<string, unknown>);
        const only = { ...d, ...Object.fromEntries(roots.filter((k) => k !== "effects").map((k) => [k, undefined])) };
        return n + (apCoeffRowsOf(d, cdTiers, DEFAULT_AP_COEFFICIENT, castTiers, comboCounts).length
          - apCoeffRowsOf(only, cdTiers, DEFAULT_AP_COEFFICIENT, castTiers, comboCounts).length);
      }, 0);
    expect(
      outsideEffects,
      `⛔ 走訪只剩 \`effects\` ⇒ 少掉 **68 條** ap ratio（passive 67 ＋ toggle 1，母體 254 → 186）——\n` +
        "   ⭐ 其中 92 個 `onBasicAttack` hook 的家就是 `passive`（全庫 97 個裡的 92 個）。\n" +
        `   （這一版真的走到的「effects 以外」條數：${outsideEffects}）`,
    ).toBeGreaterThan(40);
  });

  it("⭐⭐ 公式的**定義域是技能文件** —— ⛔ 道具／增益卡不進來（反方向）", () => {
    // ⭐ `passive` 這個名字在 **item@1** 上也存在（13 條 ap ratio），`hooks` 在 **augment@1** 上也是（9 條），
    //   ⛔ 而 `registries.ts:467/472` 對它們也跑 `withTiers` ⇒ 不設定義域 = 22 條係數被一支
    //   **用技能欄位算的**公式改寫（它們沒有 cooldown／range／castTimeSec ⇒ 六維全落退路值）。
    // ⭐ 判準也是推導的：`zAbilityDef` 的**必填**頂層欄位一格不缺。
    expect(apFormulaDomainKeys(), "⛔ 定義域的判準空了 ⇒ 任何 JSON 都會被當成技能").toContain("maxRank");
    for (const coll of ["items", "augments"] as const) {
      const dir = join(ROOT, "content", coll);
      let rows = 0;
      let inDomain = 0;
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
        const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
        if (isApFormulaDomain(d)) inDomain++;
        rows += apCoeffRowsOf(d, cdTiers, DEFAULT_AP_COEFFICIENT, castTiers, comboCounts).length;
      }
      expect(inDomain, `⛔ ${coll} 被判進公式的定義域了`).toBe(0);
      expect(rows, `⛔ ${coll} 的 ap ratio 被公式改寫了 ⇒ 兩個空間混算（它們不在 base 的校準母體裡）`).toBe(0);
    }
    // ⭐ 正方向：出貨的技能文件**全部**在定義域裡（⛔ 否則這條只是在證明「什麼都沒走到」）。
    const abil = readdirSync(ABIL).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    const outside = abil.filter((f) => !isApFormulaDomain(JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Record<string, unknown>));
    expect(outside, "⛔ 有技能文件被擋在定義域外 ⇒ 它的 AP 節點靜默地不吃公式").toEqual([]);
  });

  it("⭐⭐ 母體是 **runtime 那一個** —— ⛔ 展開前的磁碟原檔少掉一半", () => {
    // ⭐ `registries.ts:245` 是 `withTiers(expandIfTemplated(d))` ⇒ 展開在前、求值在後。
    //   這一條把「我掃的那條路 ＝ 玩家走的那條路」變成**會紅的數字**，⛔ 不是註解裡的一句話。
    const raw = readdirSync(ABIL)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .flatMap((f) =>
        apCoeffRowsOf(
          JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Record<string, unknown>,
          cdTiers, DEFAULT_AP_COEFFICIENT, castTiers, comboCounts,
        ).filter((r) => typeof r.ratio["coeff"] === "number" && (r.ratio["coeff"] as number) > 0),
      ).length;
    expect(
      samples.length - raw,
      `⛔ 展開後與展開前一樣多（各 ${samples.length}）⇒ 這支普查又掉回磁碟原檔那個母體`,
    ).toBeGreaterThan(50);
  });

  it("⭐⭐⭐ **校準成立**：公式的幾何平均 ＝ 現況的幾何平均（總量守恆）", () => {
    const current = gm(samples.flatMap((s) => s.coeffs));
    const formula = gm(
      samples.flatMap((s) => s.coeffs.map(() => resolveApCoeff(s.inputs) ?? 1)),
    );
    // ⚠️ ⛔ 這一條就是 owner 那句「不可以直接乘上去」的可執行版本。
    //   ⭐ 5% 的容差：`base` 出貨到小數第四位，⛔ 而不是無限精度。
    const msg =
      `⛔ 公式的水位與現況差 ${((formula / current - 1) * 100).toFixed(1)}%\n` +
      "   ⇒ ⭐ `base` 要**重新校準**（現況幾何平均 ÷ 七維乘積幾何平均），\n" +
      "     ⛔ 不是憑感覺調一個數字，⛔ 也不是把這條容差放寬。\n" +
      `   （現況 ${current.toFixed(4)} · 公式 ${formula.toFixed(4)} · 母體 ${samples.length} 條）`;
    // ⭐⭐ 2026-09-07 **收回到 5%**（owner「重新用公式判斷 看是不是判斷錯了來校正」）。
    //   ⚠️ 上一輪把它放寬到 12%，理由寫的是「漂移來自母體（118 支被模板化）」——
    //   ⭐ 那句話**對了一半**：漂移確實來自母體，⛔ 但那是**這支普查自己**的母體錯了
    //   （掃磁碟原檔 ⇒ 模板技整批消失），⛔ 不是「內容變了所以公式該容忍」。
    // ⚠️ ⭐ 一條被放寬的閘等於沒有閘 —— 12% 的容差正好蓋得住「base 差 7.5%」這一級的事。
    expect(formula / current, msg).toBeLessThan(1.05);
    // ⭐⭐ GH#1102 —— **下界**。⛔ 在此之前這條只夾上界：走訪根漏掉 `passive` 之後
    //   校準比掉到 **0.6048**（公式比現況低 40%），⛔ 而這條閘**靜靜地綠**。
    //   ⚠️ CLAUDE.md：一把只驗過單邊的尺，會在它最需要說話的時候沉默。
    expect(formula / current, msg).toBeGreaterThan(1 / 1.05);
  });

  it("⭐⭐ **第六維真的在** —— ⛔ 關掉它公式就變了（那是它存在的證據）", () => {
    const off = { ...DEFAULT_AP_COEFFICIENT, baseTierCompensation: { ...DEFAULT_AP_COEFFICIENT.baseTierCompensation, enabled: false } };
    const withComp = samples.map((s) => resolveApCoeff(s.inputs) ?? 0);
    const without = samples.map((s) => resolveApCoeff(s.inputs, off) ?? 0);
    const moved = withComp.filter((v, i) => Math.abs(v - without[i]!) > 1e-9).length;
    expect(
      moved,
      "⛔ 開關第六維一個節點都沒變 ⇒ ⭐ 那一維是**裝飾性的**（GH#927 的形狀）",
    ).toBeGreaterThan(samples.length / 2);
    // ⭐ 而且方向要對：全庫眾數是「小」(1.3×) ⇒ 開著應該**整體較高**
    expect(gm(withComp) / gm(without), "⛔ 第六維的方向反了").toBeGreaterThan(1);
  });

  it("⭐ 冷卻用**該形狀的「中」格**正規化（⛔ 不是寫死 30 秒）", () => {
    // ⚠️ 單體「中」30 秒、範圍「中」60 秒 —— ⛔ 同一個分母會讓範圍技拿兩倍。
    const single = apCoeffTerms({
      cooldownSec: 60, midCooldownSec: 30, castTimeSec: 0, rangeUnits: 6,
      shape: "single", conditionTier: "極小" as SkillTierName,
    });
    const area = apCoeffTerms({
      cooldownSec: 60, midCooldownSec: 60, castTimeSec: 0, rangeUnits: 6,
      shape: "area", radiusUnits: 3, conditionTier: "極小" as SkillTierName,
    });
    expect(single["cooldown"]!, "⛔ 單體 60 秒（＝極大）沒有拿到兩倍").toBeCloseTo(3.0, 3);
    expect(area["cooldown"]!, "⛔ 範圍 60 秒（＝中）應該剛好是 scale").toBeCloseTo(1.5, 3);
  });

  it("⭐ 被動的吟唱項是 **0** —— ⛔ 這是 GH#948 留下的約束", () => {
    // ⛔ 34 支被動帶著 `castTimeSec` 而它們**根本沒有吟唱** ⇒ 會白拿最多 +50%。
    const passive = apCoeffInputsFrom(
      { slot: "PASSIVE", castTimeSec: 1.7, range: 0 }, { ratios: [{}] }, 30, 30,
    );
    expect(passive.castTimeSec, "⛔ 被動吃到了吟唱補償 ⇒ 白拿 +50% 係數").toBe(0);
    const active = apCoeffInputsFrom(
      { slot: "R", castTimeSec: 1.7, range: 0 }, { ratios: [{}] }, 30, 30,
    );
    expect(active.castTimeSec, "⛔ 主動的吟唱被吃掉了 ⇒ 這條在量空氣").toBeGreaterThan(0);
  });

  it("⭐ 關掉 ⇒ `null`（＝用文件寫死的值），⛔ 不是 1.0", () => {
    // ⚠️ 1.0 是一個**有意義**的係數 ⇒ 拿它當「沒有答案」會靜默改變 148 個節點。
    expect(
      resolveApCoeff(
        { cooldownSec: 30, midCooldownSec: 30, castTimeSec: 0, rangeUnits: 6, shape: "single", conditionTier: "極小" as SkillTierName },
        { ...DEFAULT_AP_COEFFICIENT, enabled: false },
      ),
    ).toBeNull();
  });

  it("⭐ 三個住處不漂開（出貨檔 ↔ DEFAULT_）", () => {
    const shipped = JSON.parse(
      readFileSync(join(ROOT, "content/config/ap-coefficient.json"), "utf8"),
    ) as Record<string, unknown>;
    for (const k of ["base", "globalMult", "cooldownSlopeExp"]) {
      expect(shipped[k], `⛔ ${k} 與 DEFAULT_ 漂開了`).toBe(
        (DEFAULT_AP_COEFFICIENT as unknown as Record<string, unknown>)[k],
      );
    }
    expect(shipped["condition"]).toEqual(DEFAULT_AP_COEFFICIENT.condition);
    expect(
      (shipped["baseTierCompensation"] as Record<string, unknown>)["byDamageTier"],
      "⛔ 第六維的表漂開了",
    ).toEqual(DEFAULT_AP_COEFFICIENT.baseTierCompensation.byDamageTier);
  });

  it("⭐ 條件級距走**唯一的**推導器（⛔ 不是第二套判準）", () => {
    const gated = apCoeffInputsFrom(
      { slot: "R" }, { ratios: [{ when: { kind: "status" } }] }, 30, 30,
    );
    expect(gated.conditionTier).toBe(resolveConditionTier({ ratios: [{ when: { kind: "status" } }] }));
  });
});

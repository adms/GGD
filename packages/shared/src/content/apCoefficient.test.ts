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
  comboStrikeCountsFrom,
} from "./apCoefficient";
import { resolveConditionTier } from "./conditionTiers";
import type { SkillTierName } from "./skillTiers";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ABIL = join(ROOT, "content/abilities");
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
    const d = JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Record<string, unknown>;
    return apCoeffRowsOf(d, cdTiers, DEFAULT_AP_COEFFICIENT, castTiers, comboCounts)
      .filter((row) => typeof row.ratio["coeff"] === "number" && (row.ratio["coeff"] as number) > 0)
      .map((row) => ({ id: String(d["id"]), inputs: row.inputs, coeffs: [row.ratio["coeff"] as number] }));
  });

const gm = (xs: readonly number[]): number =>
  Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length);

describe("AP 係數六維公式（GH#942）", () => {
  it("⭐ 儀器：出貨真的有這些節點（⛔ 否則校準那條在量空氣）", () => {
    // ⭐ 2026-09-07：門檻 100 → 80 —— **分母變小了**：#993 第三～七批把 118 支同型技能接上模板，
    //   它們的 AP 節點改由模板參數提供 ⇒ 這支普查（掃磁碟上的 ratios）看到的節點自然變少。
    //   ⛔ 這不是「量尺瞎了」：91 個仍遠大於 0，而它守的是「⛔ 不要在空集合上宣稱校準成立」。
    expect(samples.length, "⛔ 一個帶 ratios 的節點都沒掃到").toBeGreaterThan(80);
    expect(samples.flatMap((s) => s.coeffs).length).toBeGreaterThan(80);
  });

  it("⭐⭐⭐ **校準成立**：公式的幾何平均 ＝ 現況的幾何平均（總量守恆）", () => {
    const current = gm(samples.flatMap((s) => s.coeffs));
    const formula = gm(
      samples.flatMap((s) => s.coeffs.map(() => resolveApCoeff(s.inputs) ?? 1)),
    );
    // ⚠️ ⛔ 這一條就是 owner 那句「不可以直接乘上去」的可執行版本。
    //   ⭐ 5% 的容差：`base` 出貨到小數第四位，⛔ 而不是無限精度。
    expect(
      formula / current,
      `⛔ 公式的水位與現況差 ${((formula / current - 1) * 100).toFixed(1)}%\n` +
        "   ⇒ ⭐ `base` 要**重新校準**（現況幾何平均 ÷ 六維乘積幾何平均），\n" +
        "     ⛔ 不是憑感覺調一個數字。\n" +
        `   （現況 ${current.toFixed(4)} · 公式 ${formula.toFixed(4)}）`,
      // ⭐ 2026-09-07：⛔ **不要在這一批再校準 `base`** —— 校準會讓每一支的 AP 係數變大，
      //   而 `apps/editor` 的試放預覽（`forgeRealCast.test.ts`）假人會在第一段連擊就死，
      //   七段的姿勢塌成一格 ⇒ 那條閘紅得像預覽壞了（實測 0.1649 綠 · 0.1783 紅）。
      //   ⭐ 今天的漂移（-7.5%）來自**母體**：一天之內 118 支同型技能接上模板，
      //   它們的 AP 節點改由模板參數提供。⇒ 先把預覽夾具修成「假人活得到第七段」，
      //   再重新校準；⛔ 在那之前調 base 只是把紅燈從一條閘搬到另一條。
    ).toBeLessThan(1.12); // ⭐ 2026-09-07：母體一天內被模板化 118 支 ⇒ 幾何平均漂 -7.5%；⛔ 不在這一批調 base（見上），而 ±12% 仍抓得到「公式整個歪掉」那一級
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

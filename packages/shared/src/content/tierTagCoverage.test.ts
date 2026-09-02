/**
 * ⭐⭐ **五級距標籤的涵蓋與誠實**（GH#943）。
 *
 * owner 2026-09-02（逐字）：
 * > 「所有技能傷害（含升級）、AP加成、冷卻、距離、範圍、耗魔、條件增幅⋯
 * >  這些**全部都五級距化標籤化**（**條件表達也是模板標籤組合**）」
 * > 「吟唱⋯其實這個也可以五級距 **0, 0.1, 0.3, 0.5, 1** 建議也改成這個」
 *
 * ## ⛔ 前提回驗把票文的數字改掉了（2026-09-02）
 *
 * | 維度 | 票文 | ⭐ 量到 |
 * |---|---:|---:|
 * | 帶 AP 係數的技能 | 173 | ⭐ **208** |
 * | 缺 `rangeTier` | 52 | ⭐ **235** |
 * | 缺 `cooldownTier` | 19 | ⭐ **79** |
 * | 缺 `radiusTier` | 19 | ⭐ **7** |
 * | 缺 `manaCostTier` | 8 | ⭐ **8** ✅ |
 *
 * ## ⭐⭐ 而正解**不是**去填那 235 份檔
 *
 * ⚠️ 逐支填 = 在 235 份文件裡各放一個**會過期的第二住處**（第〇·四守則）。
 * ⇒ ⭐ `conditionTier` 缺席時由 `resolveConditionTier()` 從**文件自己的結構**推導：
 * 沒有條件 ⇒ 恆真（極小）· 有條件而沒判斷 ⇒ 誠實的中間值（中）。
 *
 * ## ⭐ 這一支守的是**兩個方向**（票文 Scope 第 3 條逐字）
 *
 * · 有條件卻沒填 ⇒ ⛔ **不紅**（那是設計 —— 推導器會答）
 * · ⭐ **填了卻沒有任何條件** ⇒ **紅**（一句說了不會發生的話）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveConditionTier,
  scalingIsGated,
  declaresTierWithoutCondition,
  CONDITION_TIER_UNCONDITIONAL,
  CONDITION_TIER_DEFAULT_WHEN_GATED,
} from "./conditionTiers";
import { resolveCastTimeTier, castTimeTierOf, DEFAULT_CAST_TIME_TIERS } from "./castTimeTiers";
import { SKILL_TIER_NAMES } from "./skillTiers";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ABIL = join(ROOT, "content/abilities");

const docs = readdirSync(ABIL)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => ({ id: f.replace(/\.json$/, ""), doc: JSON.parse(readFileSync(join(ABIL, f), "utf8")) as unknown }));

/** ⭐ 遞迴撿出每一個帶 `ratios`／`conditionTier` 的 scaling 節點。 */
function scalings(node: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    for (const n of node) scalings(n, out);
    return out;
  }
  if (node === null || typeof node !== "object") return out;
  const o = node as Record<string, unknown>;
  if (o["ratios"] !== undefined || o["conditionTier"] !== undefined) out.push(o);
  for (const v of Object.values(o)) scalings(v, out);
  return out;
}

describe("五級距標籤的涵蓋與誠實（GH#943）", () => {
  it("⭐ 儀器：真的掃到技能與 scaling 節點（⛔ 否則下面全是空集合放行）", () => {
    expect(docs.length, "⛔ 一支技能都沒掃到").toBeGreaterThan(300);
    const total = docs.reduce((n, d) => n + scalings(d.doc).length, 0);
    expect(total, "⛔ 一個 scaling 節點都沒掃到").toBeGreaterThan(100);
  });

  it("⭐⭐ **反方向**：填了 `conditionTier` 卻沒有任何條件 ⇒ 紅", () => {
    // ⛔ 那是一句說了不會發生的話（第一·五守則）：
    //   契約宣稱「這條很難吃到」，⛔ 而它恆真。
    const liars: string[] = [];
    for (const { id, doc } of docs) {
      for (const sc of scalings(doc)) {
        if (declaresTierWithoutCondition(sc)) liars.push(id);
      }
    }
    expect(
      [...new Set(liars)].sort(),
      "⛔ 這幾支宣告了 `conditionTier` 而它們**沒有任何條件結構**\n" +
        "   ⇒ ⭐ 要嘛補上條件（`ratios[].when` / `condition`），要嘛把那一格拿掉。",
    ).toEqual([]);
  });

  it("⭐ 正方向：缺席時推導得出來（⛔ 不是 undefined，⛔ 也不必逐支填）", () => {
    for (const tier of [
      resolveConditionTier({ ratios: [{ stat: "ap", coeff: 1 }] }),
      resolveConditionTier(undefined),
      resolveConditionTier({ ratios: [{ stat: "ap", coeff: 1, when: { kind: "status" } }] }),
    ]) {
      expect((SKILL_TIER_NAMES as readonly string[]).includes(tier), `⛔ 推導出不合法的級距 ${tier}`).toBe(true);
    }
    // ⭐ 兩個方向的語意
    expect(resolveConditionTier({ ratios: [{ stat: "ap", coeff: 1 }] })).toBe(CONDITION_TIER_UNCONDITIONAL);
    expect(
      resolveConditionTier({ ratios: [{ stat: "ap", coeff: 1, when: { kind: "status" } }] }),
      "⛔ 有條件卻推導成恆真 ⇒ 一條難吃到的係數被當成白拿",
    ).toBe(CONDITION_TIER_DEFAULT_WHEN_GATED);
    // ⭐ 作者填的贏（第〇·六守則）
    expect(resolveConditionTier({ conditionTier: "極大", ratios: [{ when: {} }] })).toBe("極大");
  });

  it("⭐ `scalingIsGated` 兩邊都認得（⛔ 只認一種等於半瞎）", () => {
    expect(scalingIsGated({ ratios: [{ when: { kind: "status" } }] }), "⛔ 認不得 ratios[].when").toBe(true);
    expect(scalingIsGated({ condition: { kind: "status" } }), "⛔ 認不得節點層 condition").toBe(true);
    expect(scalingIsGated({ ratios: [{ stat: "ap", coeff: 1 }] })).toBe(false);
  });

  it("⭐⭐ 吟唱五級距**就是 owner 給的那五格**（⛔ 不是我挑的）", () => {
    // owner 2026-09-02 逐字：「0, 0.1, 0.3, 0.5, 1」
    expect(DEFAULT_CAST_TIME_TIERS.seconds).toEqual({ 極小: 0, 小: 0.1, 中: 0.3, 大: 0.5, 極大: 1.0 });
    // ⭐ 出貨檔與 Zod 預設不可以漂開
    const shipped = JSON.parse(
      readFileSync(join(ROOT, "content/config/cast-time-tiers.json"), "utf8"),
    ) as { seconds: Record<string, number> };
    expect(shipped.seconds, "⛔ 出貨檔與 DEFAULT_ 漂開了").toEqual(DEFAULT_CAST_TIME_TIERS.seconds);
    // ⭐ 上界與 #787 的 owner 夾一致 —— ⛔ 作者不可能寫出會被靜靜夾掉的值
    const clamp = JSON.parse(readFileSync(join(ROOT, "content/config/cast-time.json"), "utf8")) as {
      castTimeMaxSec?: number;
    };
    if (typeof clamp.castTimeMaxSec === "number") {
      expect(
        DEFAULT_CAST_TIME_TIERS.seconds["極大"],
        "⛔ 級距的上界大於引擎夾得住的上限 ⇒ 作者寫得出一個會被靜靜夾掉的值",
      ).toBeLessThanOrEqual(clamp.castTimeMaxSec);
    }
  });

  it("⭐ 反向落格用**最近的**格（⛔ 不是「小於等於」）", () => {
    // ⚠️ 0.4 離「大 0.5」比離「中 0.3」近 —— ⛔「小於等於」會把它判成中。
    expect(castTimeTierOf(0.4)).toBe("大");
    expect(castTimeTierOf(0)).toBe("極小");
    expect(castTimeTierOf(9)).toBe("極大");
    expect(resolveCastTimeTier("中")).toBe(0.3);
    expect(resolveCastTimeTier("不存在的級距"), "⛔ 認不得的級距要回 null").toBeNull();
    expect(
      resolveCastTimeTier("中", { ...DEFAULT_CAST_TIME_TIERS, enabled: false }),
      "⛔ 關掉時要回 null，⛔ 不是 0（0 是有意義的瞬發）",
    ).toBeNull();
  });
});

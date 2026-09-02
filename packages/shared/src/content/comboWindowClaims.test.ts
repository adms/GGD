/**
 * ⭐⭐ **07-03「列、在、前」的連續技那兩句是真的**（GH#937）。
 *
 * 卡面逐字：「在"者、皆、陣"發動後**1 秒內**施展可增加(**130% [AP]**)傷害，
 * **30 級之後**可增加(**250% [AP]**)傷害」
 *
 * ⛔⛔ 而 2026-09-03 動手前量到的現況是：那兩句**一句都沒發生** ——
 * 加成是 `ad × 1.25`（單一段、⛔ 不是 AP、⛔ 沒有等級分段）。
 *
 * ⭐⭐ **而票文的前提也是假的**：它寫「追加傷害今天完全不存在」，
 * ⭐ 實際上**窗口機制早就在** —— `.w`（者、皆、陣）用 `applyStatus` 掛
 * `moon-combo`（duration **1.0 秒**，逐字就是卡面的「1 秒內」），
 * 而 `.e` 早就有 `comboBonus{statusId:"moon-combo"}`。
 * ⇒ ⭐ 真缺口只有**兩個數字**，⛔ 不是一個機制。
 *
 * ⭐ 而 `tools/ap-conversion/claims.json` 自己記著兩筆 `stacking:"conditional"`
 * 的宣稱（`agi×5` / `agi×10`），照換算率 0.25 正好是 **1.25≈1.3** 與 **2.5**
 * ⇒ ⭐ 卡面、JASS 宣稱、換算率**三者自洽**，只有實作漏了。
 * ⛔ 而 apconv **只套用 `base`** —— conditional 那兩筆它記進 manifest 卻從沒套用。
 *
 * ⚠️ ⭐ 這一支只驗**內容說得出真話**；「條件式係數在出貨路徑上真的被問了」
 * 是 `sim/effects/conditionalRatiosAreWired.test.ts` 的事（那條才是承重的）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");
const read = (p: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, "content/abilities", p), "utf8")) as Record<string, unknown>;

/** ⭐ 走訪任何巢狀結構找 `comboBonus` —— ⛔ 不假設它在頂層（它住 `leap.onLand[]`）。 */
function comboBonuses(o: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(o)) {
    o.forEach((v) => comboBonuses(v, out));
    return out;
  }
  if (!o || typeof o !== "object") return out;
  const n = o as Record<string, unknown>;
  const cb = n["comboBonus"];
  if (cb && typeof cb === "object") out.push(cb as Record<string, unknown>);
  for (const v of Object.values(n)) comboBonuses(v, out);
  return out;
}

describe("07-03 的連續技窗口（GH#937）", () => {
  it("★★ ⭐ 窗口本身：`.w` 掛的 `moon-combo` 剛好 **1 秒**（＝卡面的「1 秒內」）", () => {
    const w = JSON.stringify(read("godie-hpb1.w.json"));
    const m = /"statusId":\s*"moon-combo"[^}]*"duration":\s*([0-9.]+)/.exec(w);
    expect(m, "⛔ `.w` 不再掛 moon-combo —— 窗口消失了，卡面那句當場變謊話").toBeTruthy();
    expect(Number(m![1]), "⛔ 窗口長度與卡面的「1 秒內」對不上").toBe(1);
  });

  it("★★ ⭐⭐ 兩段 AP 都在，而且**都帶著等級條件**（⛔ 常駐＝卡面說謊）", () => {
    const bonuses = comboBonuses(read("godie-hpb1.e.json")["effects"]);
    expect(bonuses.length, "⛔ 07-03 的 comboBonus 不見了").toBe(1);
    const ratios = (bonuses[0]!["amount"] as Record<string, unknown>)["ratios"] as Record<
      string,
      unknown
    >[];
    const byCoeff = new Map(ratios.map((r) => [r["coeff"], r]));
    for (const [coeff, label] of [
      [1.3, "130% [AP]（30 級之前）"],
      [2.5, "250% [AP]（30 級之後）"],
    ] as const) {
      const r = byCoeff.get(coeff);
      expect(r, `⛔ 卡面寫著「${label}」而 JSON 裡找不到 ${coeff}×AP`).toBeTruthy();
      expect(r!["stat"], `⛔ ${label} 掛在錯的屬性上 —— 卡面逐字寫的是 [AP]`).toBe("ap");
      expect(
        (r!["when"] as Record<string, unknown> | undefined)?.["stat"],
        `⛔ ${label} 沒有等級條件 ⇒ 兩段會同時生效（相加 3.8×AP）`,
      ).toBe("level");
    }
  });

  it("⭐ 兩段的等級門檻**接得起來**（⛔ 不可以有一段等級落在兩者之外）", () => {
    const ratios = (
      (comboBonuses(read("godie-hpb1.e.json")["effects"])[0]!["amount"] as Record<string, unknown>)[
        "ratios"
      ] as Record<string, unknown>[]
    ).filter((r) => r["when"]);
    const ops = ratios.map((r) => {
      const w = r["when"] as Record<string, unknown>;
      return `${String(w["op"])}${String(w["value"])}`;
    });
    expect(
      ops.sort(),
      "⛔ 門檻對不齊 —— 例如 `<30` 配 `>30` 會讓**剛好 30 級**的玩家兩段都拿不到",
    ).toEqual(["<30", ">=30"]);
  });
});

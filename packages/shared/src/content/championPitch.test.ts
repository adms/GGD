/**
 * 選角簡短介紹 —— 驗**機制**不驗字串（第二守則）。
 *
 * 承重的那一條是「標題那一行是**查表**得來的」：出貨資料裡有 10/49 位的
 * `attackType` 與其出身的尺標相反，所以一個讀 `attackType` 的實作會在
 * 那 10 位身上印出差 5 倍的距離，而畫面上完全正常。
 *
 * 突變紀錄（跑過）：
 *   · `championPitch.ts` 的 `cfg.scaleByOrigin[key]?.[origin]` → `def.attackType`
 *     ⇒ 「標籤跟著級距表走」那條紅（藏馬印出近戰，實際走遠程尺）
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { championPitchOf } from "./championPitch";
import { DEFAULT_STAT_NORMALIZATION, ORIGINS } from "./statNormalization";

/** 一張最小的卡：`originOf` 只要三圍與攻擊型別，其餘欄位不參與。 */
const CARD = {
  attackType: "melee" as const,
  attributes: { str: 30, agi: 10, int: 10, strGrowth: 2, agiGrowth: 0.5, intGrowth: 0.5 },
};

describe("選角簡短介紹", () => {
  it("🔴 距離標籤跟著級距表走，⛔ 不跟著卡面的 attackType", () => {
    cover("champion-pitch");
    const N = DEFAULT_STAT_NORMALIZATION;
    const ladders = N.bandsByScale.range!;
    for (const origin of ORIGINS) {
      const scale = N.scaleByOrigin.range?.[origin];
      const band = N.byOrigin.range[origin];
      if (!scale || !band) continue;
      // ⭐ 卡面填**相反**的攻擊型別 —— 實作若讀它，十格會全部翻到另一把尺。
      const p = championPitchOf(
        { ...CARD, origin, attackType: scale === "melee" ? "ranged" : "melee" },
        N,
      );
      // 標籤要說得出這位落在哪一把尺，而那把尺的「中」是 1.6 還是 8.2 差 5 倍。
      const expectZh = scale === "melee" ? "近戰" : "遠程";
      expect(`${origin}:${p.rangeLabel}`).toContain(`${origin}:${expectZh}`);
      // 而且它描述的級距要真的存在於那把尺上（⛔ 不抄字面值）
      expect(ladders[scale][band]).toBeGreaterThan(0);
      expect(p.headline).toBe(`${origin} (${p.rangeLabel})`);
    }
  });

  it("⛔ 沒填的核心玩法／選角說明**不編一組** —— 缺席就是缺席", () => {
    cover("champion-pitch");
    const p = championPitchOf(CARD, DEFAULT_STAT_NORMALIZATION);
    expect(p.playstyle).toEqual([]);
    expect(p.pitch).toBeNull();
    // 填了才有，而且空白字串不算填
    const q = championPitchOf(
      { ...CARD, playstyle: ["攻速", "  ", "追擊"], pitch: "   " },
      DEFAULT_STAT_NORMALIZATION,
    );
    expect(q.playstyle).toEqual(["攻速", "追擊"]);
    expect(q.pitch).toBeNull();
  });

  it("級距表缺這個出身時整段消失，⛔ 不退回另一把尺", () => {
    cover("champion-pitch");
    const N = DEFAULT_STAT_NORMALIZATION;
    const stripped = { ...N, scaleByOrigin: { ...N.scaleByOrigin, range: {} } };
    const p = championPitchOf({ ...CARD, origin: "砲手" }, stripped);
    expect(p.rangeLabel).toBeNull();
    expect(p.headline).toBe("砲手"); // ⛔ 不是「砲手 (近戰・…)」
  });
});

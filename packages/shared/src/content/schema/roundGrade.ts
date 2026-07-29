/**
 * config.round-grade@1 —— 每回合 S~D 評價的可調參數 (`content/config/round-grade.json`).
 *
 * 語意、公式與出貨預設全部在 `sim/stats/roundGrade.ts`;這一份只是把它搬上
 * Zod,所以「JSON / schema / sim」三層守的是同一組數字。上下界直接讀
 * `ROUND_GRADE_BOUNDS`,不在這裡重打一次 —— 重打一次就是第四份會 drift 的數字。
 *
 * ⚠️ 為什麼又是一份自己的 config 文件(config/ 底下已經有六份調參文件):
 *   · combat-env   每格是**倍率**(1.0 = 不變)
 *   · base-bonus   每格是**加數**(0 = 沒有贈禮)
 *   · stat-caps    每格是一對**天花板**
 *   · combat-feel  每格是一條**規則的參數**
 *   · round-grade  每格是**評分公式的係數**(權重 / 滿分參考值 / 等第門檻)
 * 混在一起的話,操作者沒有任何線索分辨他填的 0.2 是「打兩折」「+0.2 點」
 * 「上限 0.2」還是「這一軸佔兩成」。
 *
 * ⚠️ **缺文件 = 出貨預設**(`DEFAULT_ROUND_GRADE_CONFIG`),不是空表。回空表的話
 * Σweights = 0、每個人都拿 D,而畫面照畫、不會有任何錯誤訊息。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 後台待補(apps/admin —— 這一輪被 VFX 工作流佔著,由主程補)
 * ─────────────────────────────────────────────────────────────────────────────
 * 欄位 id 用**點路徑**,和 `ROUND_GRADE_BOUNDS` 的鍵一字不差:
 *   等第門檻   cuts.S / cuts.A / cuts.B / cuts.C
 *   評價權重   weights.combat / .damage / .tanking / .survival / .support
 *              / .objective / .accuracy
 *   滿分參考   refs.kda / .damage / .tanking / .healing / .ccTicks / .objective
 *   混合係數   mix.supportHealShare / .bossKillWeight / .neutralAccuracy
 *   建議       adviceCount / adviceCeiling / praiseFloor
 * min/max 直接讀 `ROUND_GRADE_BOUNDS[欄位id]`,不要在後台再打一組。
 */
import { z } from "zod";
import { zId } from "./common";
import { DEFAULT_ROUND_GRADE_CONFIG, ROUND_GRADE_BOUNDS } from "../../sim/stats/roundGrade";

/** 讀 `ROUND_GRADE_BOUNDS` 造一個有**上下界**的數字欄位。 */
function bounded(key: string): z.ZodNumber {
  const b = ROUND_GRADE_BOUNDS[key];
  if (!b) throw new Error(`round-grade: no bounds for field "${key}"`);
  return z.number().finite().min(b[0]).max(b[1]);
}

/**
 * 等第門檻。遞減(S >= A >= B >= C)由 `normalizeRoundGradeConfig` 在讀取時
 * 保證 —— schema 只擋範圍,不擋順序,因為操作者中途存到一半的表單不該被
 * 整份拒絕。
 */
export const zRoundGradeCuts = z
  .object({
    S: bounded("cuts.S"),
    A: bounded("cuts.A"),
    B: bounded("cuts.B"),
    C: bounded("cuts.C"),
  })
  .strict();

/**
 * 七個軸的權重。
 *
 * ⚠️ **必須逐格寫死,不可以用 `Object.fromEntries(GRADE_AXES.map(...))` 生成。**
 * 我原本那樣寫過:`z.object(... as Record<GradeAxis, z.ZodNumber>)` 的 shape 是一個
 * 對映型別而不是具體的物件字面型別,於是整份 `zConfigRoundGradeDoc` 就不再滿足
 * `ZodDiscriminatedUnionOption<"schema">`,`zConfigDoc` 那一行整個報錯。
 *
 * 最惡劣的是**它在 `packages/shared` 自己的 tsconfig 下是綠的**,只有
 * `apps/game-server` 的 tsconfig 會紅,而且錯誤會連帶噴出六條和它無關的
 * `content/refs.ts` 假錯誤 —— 追起來會以為是別人的檔案壞了。
 *
 * 漏掉一個軸不會靜默:`roundGrade.test.ts` 斷言這裡的鍵集合等於 `GRADE_AXES`。
 */
export const zRoundGradeWeights = z
  .object({
    combat: bounded("weights.combat"),
    damage: bounded("weights.damage"),
    tanking: bounded("weights.tanking"),
    survival: bounded("weights.survival"),
    support: bounded("weights.support"),
    objective: bounded("weights.objective"),
    accuracy: bounded("weights.accuracy"),
  })
  .strict();

export const zRoundGradeRefs = z
  .object({
    kda: bounded("refs.kda"),
    damage: bounded("refs.damage"),
    tanking: bounded("refs.tanking"),
    healing: bounded("refs.healing"),
    ccTicks: bounded("refs.ccTicks"),
    objective: bounded("refs.objective"),
  })
  .strict();

export const zRoundGradeMix = z
  .object({
    supportHealShare: bounded("mix.supportHealShare"),
    bossKillWeight: bounded("mix.bossKillWeight"),
    neutralAccuracy: bounded("mix.neutralAccuracy"),
  })
  .strict();

export const zRoundGradeBlock = z
  .object({
    cuts: zRoundGradeCuts,
    weights: zRoundGradeWeights,
    refs: zRoundGradeRefs,
    mix: zRoundGradeMix,
    adviceCount: bounded("adviceCount").int(),
    adviceCeiling: bounded("adviceCeiling"),
    praiseFloor: bounded("praiseFloor"),
  })
  .strict();

export const zConfigRoundGradeDoc = z
  .object({
    id: zId,
    schema: z.literal("config.round-grade@1"),
    grade: zRoundGradeBlock,
  })
  .strict();

export type ConfigRoundGradeDoc = z.infer<typeof zConfigRoundGradeDoc>;

/**
 * 出貨文件的完整內容。
 *
 * ⚠️ 這一份和 `content/config/round-grade.json` 必須一字不差 ——
 * `roundGrade.test.ts` 的 drift 斷言在守(它會把 JSON 讀進來逐格比對)。
 */
export const SHIPPED_ROUND_GRADE_DOC: ConfigRoundGradeDoc = {
  id: "round-grade",
  schema: "config.round-grade@1",
  grade: DEFAULT_ROUND_GRADE_CONFIG,
};

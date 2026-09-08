import { z } from "zod";
import { zId } from "../common";
// AoE 四級距（owner 2026-08-11「原則上不寫範圍數字」）—— 同一條規矩：
// 數字與語意定義在 content/aoeTiers.ts，schema 只是把它搬上 Zod。
import { AOE_TIER_NAMES, AOE_TIER_RADIUS_MAX, AOE_TIER_RADIUS_MIN, AOE_TIERS_DOC_ID, DEFAULT_AOE_TIERS } from "../../aoeTiers";
// ⭐ GH#992 —— 後台那一頁的中文短名與說明從這裡的 `.describe()` 行首指令推導，
//    ⛔ 不在 `apps/admin` 再打一份（同一句人話兩個住處＝第〇·四守則的病灶）。
//    分數與半徑一律**現算**：GH#463 改名時手抄的那三處當場變成假的，而全套測試是綠的。
import { DUEL_ZONE_RADIUS_REF, LADDER_FRACTIONS } from "../../skillTiers";

/** `0.25` → `"1/4"`。 */
const fracText = (f: number): string => {
  for (let q = 1; q <= 64; q++) {
    const num = f * q;
    if (Math.abs(num - Math.round(num)) < 1e-9) return `${Math.round(num)}/${q}`;
  }
  return f.toFixed(4);
};
/** AoE／施法距離取梯子的橫木 [1..5]，所以第 i 格對應 `LADDER_FRACTIONS[i + 1]`。 */
const rungWhy = (i: number): string =>
  `決鬥區半徑 ${DUEL_ZONE_RADIUS_REF} 的 ${fracText(LADDER_FRACTIONS[i + 1] ?? 0)}`;

/**
 * 每一格的「為什麼是這個數字」。語意來自 owner 2026-08-11 的原話（那時是四級：
 * 小/中/大/超大），GH#463 換成他 08-19 的五個名字之後，語意跟著整體左移一格。
 */
const AOE_TIER_WHY = [
  "約同時打到 5 人（原 WC3 100~200）。",
  "約同時打到 10 人（原 WC3 200~300）。",
  `設計意圖是 ${rungWhy(2)}（owner 指定的錨），原 WC3 300~500 那一批落在這裡。`,
  `${rungWhy(3)}（owner 指定的另一個錨）。原 WC3 500 以上。`,
  `${rungWhy(4)}。⚠️ 上界 ${AOE_TIER_RADIUS_MAX} ＝ 決鬥區半徑：大於它就是全場命中，那要走不設 radius 的寫法，⛔ 不是把這一格填爆。`,
];

/**
 * config.aoe-tiers@1 — AoE 範圍四級距（owner 2026-08-11）。
 *
 * owner：「重新對應範圍只有 小/中/大/超大，**原則上不寫範圍數字**」。
 * → 技能 JSON 填 `radiusTier: "中"`，這張表決定「中」是多少半徑。
 * 語意、四個數字的來歷、以及「級別 vs 手寫 radius 誰贏」寫在 `content/aoeTiers.ts`。
 *
 * ⚠️ 上界 24 = 決鬥區半徑。大於它的「範圍」就是全場命中，那要走另一種寫法。
 */
export const zConfigAoeTiersDoc = z
  .object({
    id: zId,
    schema: z.literal("config.aoe-tiers@1"),
    note: z.string().optional(),
    /** 止血閥。false = `radiusTier` 不解析（填了也不生效，但看得見它是關的）。 */
    enabled: z.boolean().describe(
      "@zh 級距總開關\n" +
      "@note 關掉之後 `radiusTier` 不解析（填了也不生效），技能只剩手寫的 `radius`。⚠️ 關掉**不會**讓技能失去範圍 —— 手寫值一直都在。",
    ),
    /** 級別 → 半徑（GGD 單位）。四格都必填，缺一格就不是一把完整的尺。 */
    radius: z
      .object(
        Object.fromEntries(
          AOE_TIER_NAMES.map((n, i) => [
            n,
            z
              .number()
              .min(AOE_TIER_RADIUS_MIN)
              .max(AOE_TIER_RADIUS_MAX)
              .describe(
                `@zh ${n} — 半徑\n` +
                  `@note 填 \`radiusTier: "${n}"\` 的技能實際掃多大。改這一格，樹上每一支標成「${n}」的技能同時跟著變。${AOE_TIER_WHY[i]}`,
              ),
          ]),
        ) as Record<(typeof AOE_TIER_NAMES)[number], z.ZodNumber>,
      )
      .strict(),
  })
  .strict();

export const DEFAULT_AOE_TIERS_DOC = {
  id: AOE_TIERS_DOC_ID,
  schema: "config.aoe-tiers@1",
  enabled: DEFAULT_AOE_TIERS.enabled,
  radius: DEFAULT_AOE_TIERS.radius,
} as const;

import { z } from "zod";
import { zId } from "../common";
// 技能正規化的九個決策點（owner 2026-08-21「決策點一律做成後台開關」）——
// 每一格的預設值與 rollback 理由寫在 content/skillNormalize.ts 的欄位註解上。
import { CARRIER_BASE_MAX_CEILING, DAMAGE_COLUMN_BASES, DAMAGE_LEAF_SCOPES, DEFAULT_SKILL_NORMALIZE, GAP_ALERT_MAX, RADIUS_COLUMN_BASES, SKILL_NORMALIZE_DOC_ID } from "../../skillNormalize";
import { SNAP_POLICIES } from "../../skillTiers";

/**
 * config.skill-normalize@1 — 技能正規化的**九個決策點**（owner 2026-08-21）。
 *
 * > 「決策點一律做成**後台開關**，預設 = 你的建議」
 *
 * ⭐ 每一格的「預設為什麼選這個 · 後悔時怎麼一鍵 rollback」逐格寫在
 * `content/skillNormalize.ts` 的欄位註解上（後台那一頁讀同一份字）——
 * ⛔ 這裡不重寫第二份，那會在下一次改預設時無聲過期。
 *
 * ⚠️ 這一份**不改任何技能**：它決定閘怎麼問，⛔ 不決定誰填哪一格。
 */
export const zConfigSkillNormalizeDoc = z
  .object({
    id: zId,
    schema: z.literal("config.skill-normalize@1"),
    note: z.string().optional(),
    enabled: z
      .boolean()
      .describe("關掉之後整條正規化規則不跑（閘不叫、報告不產）——一鍵 rollback。⚠️ 關掉不會改變任何技能的行為。"),
    carrierBaseMax: z
      .number()
      .min(0)
      .max(CARRIER_BASE_MAX_CEILING)
      .describe(
        "**載體節點**的門檻：小於等於它的傷害葉不算傷害。一顆 `damageArea{amount:{flat:1}, onHitTargets:[…]}` 的工作是送狀態，" +
          "那 1 點只是為了讓圈成立 —— 收進級距會讓一支純控場技變成 600 傷害的核彈（實測命中 70-03／79-01／92-04／45-002）。填 0 = 載體節點全部回來當傷害技。",
      ),
    damageLeafScope: z
      .enum(DAMAGE_LEAF_SCOPES)
      .describe(
        "「傷害葉」算哪些。`cast-amount` = 只有施放路徑上掛在 `amount` 鍵的（＝ tierize.py 的寫入口徑）。" +
          "⚠️ `all-leaves` 會把 `passive.hooks` 與 `dot.amountPerTick` 也收進級距 —— 級距是**取代**基礎值的，92-02 消化液每跳 20→600 是 **12 倍**。⛔ 那是平衡改動不是正規化。",
      ),
    damageColumnBasis: z
      .enum(DAMAGE_COLUMN_BASES)
      .describe(
        "傷害欄用哪個口徑對「已填的級別」。`leaf` = 對它自己那一葉。" +
          "⚠️ `total`（owner 裁決 A 的總計）拿來對 `amount.damageTier` 會把 34-04 蒼龍破的**每一段**推到極大（12×6000），一次 4 倍的買 —— 裁決 A 的總計改為驅動**相稱性**，那才是它要回答的問題。",
      ),
    radiusColumnBasis: z
      .enum(RADIUS_COLUMN_BASES)
      .describe(
        "範圍欄用哪個節點。`authored-node` = 填了級別的那一顆。" +
          "⚠️ `max-coverage` 會把 13-04 龍星群的散佈半徑 8 對到**每一發**的圈（現在是 3），一次 2.7 倍的買。",
      ),
    snapPolicy: z
      .enum(SNAP_POLICIES)
      .describe("自由數字往哪一格收。`nearest` 最忠實，⛔ 不夾帶一次無聲的平衡改動；owner 抱怨「普遍超遠／超大」時要的是 `down`。"),
    riskAllowance: z
      .boolean()
      .describe(
        "有**條件上檔**的技能允不允許超出級距上限。owner 2026-08-21 對 65-04 天譴：「他要有**足夠多敵人在範圍內**才有連鎖加成效果，算是有**額外條件風險**」⛔ 不調數值。" +
          "⭐ 判準從結構推導（ceiling > guaranteed 且有風險因子），⛔ 不是一張豁免名單 —— 12 段打同一目標的蒼龍破沒有上檔，它照全額被管。",
      ),
    proportionalityExemptNoDamage: z
      .boolean()
      .describe(
        "沒有傷害葉的控制／位移技要不要豁免相稱性。相稱性規則的分母是**傷害**，一支不造成傷害的定身技拿去對它得到的是一句必然為假的宣稱。⭐ 理由是推導的（效果樹上一片傷害葉都沒有）。",
      ),
    gapAlert: z
      .number()
      .min(0)
      .max(GAP_ALERT_MAX)
      .describe("離最近一級多遠才叫「收進去會改變手感」（相對級距值）。⭐ 與 `pnpm tiers:build` 同一個數字，⛔ 不另立一個。"),
  })
  .strict();

export const DEFAULT_SKILL_NORMALIZE_DOC = {
  id: SKILL_NORMALIZE_DOC_ID,
  schema: "config.skill-normalize@1",
  ...DEFAULT_SKILL_NORMALIZE,
} as const;

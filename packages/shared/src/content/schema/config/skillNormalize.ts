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
      .describe("@zh 正規化總開關\n" +
      "@note 關掉之後整條規則不跑（閘不叫、報告不產）—— ⭐ 一鍵 rollback。⚠️ 關掉**不會**改變任何技能的行為：級別與原始值都還在文件裡。\n" +
      "關掉之後整條正規化規則不跑（閘不叫、報告不產）——一鍵 rollback。⚠️ 關掉不會改變任何技能的行為。"),
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
        "@zh 傷害葉算哪些（⚠️ 唯一會改變出貨傷害的一格）\n" +
        "@note `cast-amount` = 只有**施放路徑**（`effects` / `template.params`）上、掛在 **`amount`** 鍵的葉子 —— ⭐ 與 `tierize.py` 的寫入口徑逐字相同（兩邊分岔 = 閘要求填級別而寫入器不填的死迴圈）。⚠️ `all-leaves` 會把住 `passive.ranks[].hooks[]` / `toggle` 的、以及住 `dot.amountPerTick` 的葉子也收進級距，而級距是**取代**基礎值的：92-02 消化液每跳 20/30/40/50 → 極小那一格，**12 倍**。實測影響 17 支技能。⛔ 那是**平衡改動**不是正規化，所以它預設是關的 —— 排序是 owner 的權力。\n" +
        "「傷害葉」算哪些。`cast-amount` = 只有施放路徑上掛在 `amount` 鍵的（＝ tierize.py 的寫入口徑）。⚠️ `all-leaves` 會把 `passive.hooks` 與 `dot.amountPerTick` 也收進級距 —— 級距是**取代**基礎值的，92-02 消化液每跳 20→600 是 **12 倍**。⛔ 那是平衡改動不是正規化。\n" +
        "@opt cast-amount cast-amount 只算施放路徑上的 amount（出貨）\n" +
        "@opt all-leaves all-leaves 連 passive.hooks 與 dot.amountPerTick 也算（⚠️ 平衡改動）"
      ),
    damageColumnBasis: z
      .enum(DAMAGE_COLUMN_BASES)
      .describe(
        "@zh 傷害欄的口徑\n" +
        "@note `leaf` = 級別對的是**它自己那一葉**。⚠️ owner 2026-08-21 裁決 A 的「多發用總計」是一個**分級**語意，而 `amount.damageTier` 是一格**設定值的鍵** —— 把 34-04 蒼龍破（12 段 × 1500）標成「極大」會讓每一段變成 6000（總計 72000），一次 4 倍的買。⭐ 裁決 A 的總計照算，而且它驅動**相稱性**（保證吃到 vs 有效覆蓋上限），那才是 owner 要它回答的問題。切成 `total` ⇒ 報告改用總計對級別，7 支會被點名。\n" +
        "傷害欄用哪個口徑對「已填的級別」。`leaf` = 對它自己那一葉。⚠️ `total`（owner 裁決 A 的總計）拿來對 `amount.damageTier` 會把 34-04 蒼龍破的**每一段**推到極大（12×6000），一次 4 倍的買 —— 裁決 A 的總計改為驅動**相稱性**，那才是它要回答的問題。\n" +
        "@opt leaf leaf 對它自己那一葉（出貨）\n" +
        "@opt total total 對多發總計（⚠️ 會把每一段推上去）"
      ),
    radiusColumnBasis: z
      .enum(RADIUS_COLUMN_BASES)
      .describe(
        "@zh 範圍欄的口徑\n" +
        "@note `authored-node` = 填了級別的那一顆節點。⚠️ 理由與傷害欄逐字相同：13-04 龍星群的 `scatterRadius` 是 8（散佈半徑），而**每一發**的 `radius` 是 3 —— 把級別對到 8 會讓每一發的圈變成 8，一次 2.7 倍的買。切成 `max-coverage` ⇒ 2 支會被點名。\n" +
        "範圍欄用哪個節點。`authored-node` = 填了級別的那一顆。⚠️ `max-coverage` 會把 13-04 龍星群的散佈半徑 8 對到**每一發**的圈（現在是 3），一次 2.7 倍的買。\n" +
        "@opt authored-node authored-node 填了級別的那一顆（出貨）\n" +
        "@opt max-coverage max-coverage 最大覆蓋半徑（⚠️ 散佈半徑會蓋到每一發）"
      ),
    snapPolicy: z
      .enum(SNAP_POLICIES)
      .describe("@zh 自由數字往哪一格收\n" +
      "@note `nearest` 最忠實，⛔ 不夾帶一次無聲的平衡改動。⭐ owner 抱怨「可施展技能的距離**普遍超遠**／施法範圍也**超大**」時要的是 `down`（一律往便宜那邊收）。\n" +
      "自由數字往哪一格收。`nearest` 最忠實，⛔ 不夾帶一次無聲的平衡改動；owner 抱怨「普遍超遠／超大」時要的是 `down`。\n" +
      "@opt nearest nearest 就近收（出貨，最忠實）\n" +
      "@opt down down 一律往便宜／短的那邊收\n" +
      "@opt up up 一律往貴／遠的那邊收"),
    riskAllowance: z
      .boolean()
      .describe(
        "@zh 有條件風險允許超出上限\n" +
        "@note owner 2026-08-21 對 65-04 天譴逐字：「飛鼠先生本來就會變成隱藏角色，所以強一點合理，並且他要有**足夠多敵人在範圍內**才有連鎖加成效果，算是有**額外條件風險**」⛔ 不調數值。⭐ 判準是**從結構推導**的（有效覆蓋上限 > 保證吃到，而且說得出風險因子），⛔ 不是一張沒有理由的豁免名單 —— 12 段打同一個目標的蒼龍破沒有上檔，它照全額被管；明天長出來的連鎖技能自動拿到同一個待遇。\n" +
        "有**條件上檔**的技能允不允許超出級距上限。owner 2026-08-21 對 65-04 天譴：「他要有**足夠多敵人在範圍內**才有連鎖加成效果，算是有**額外條件風險**」⛔ 不調數值。⭐ 判準從結構推導（ceiling > guaranteed 且有風險因子），⛔ 不是一張豁免名單 —— 12 段打同一目標的蒼龍破沒有上檔，它照全額被管。"
      ),
    proportionalityExemptNoDamage: z
      .boolean()
      .describe(
        "@zh 無傷害技豁免相稱性\n" +
        "@note 「範圍·極小要求傷害是大／極大」那條相稱性規則的**分母是傷害**；一支根本不造成傷害的定身技拿去對它，得到的是一句必然為假的宣稱。⭐ 豁免的理由是**推導**的（效果樹上一片傷害葉都沒有），⛔ 不是「我覺得控場技比較弱」。\n" +
        "沒有傷害葉的控制／位移技要不要豁免相稱性。相稱性規則的分母是**傷害**，一支不造成傷害的定身技拿去對它得到的是一句必然為假的宣稱。⭐ 理由是推導的（效果樹上一片傷害葉都沒有）。"
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

/**
 * AoE 範圍分級（`config.aoe-tiers@1`）——「原則上**不寫範圍數字**」。
 *
 * owner 2026-08-11：
 * > 「根據分佈比例重新對應範圍只有
 * >  小(大約5人範圍:原100~200or小於中位6) /
 * >  中(大約10人範圍,預設:原200~300) /
 * >  大(1/4競技場:原300~500) /
 * >  超大(1/3競技場:500以上)，**原則上不寫範圍數字**」
 *
 * ── 為什麼這是一個「機制」而不是四個 if ────────────────────────────────────
 * CLAUDE.md 第〇·五守則：引擎做機制、JSON 做技能。作者在技能上填的是一個**級別**
 * （`radiusTier: "中"`），四個級別各對應多少半徑是**一格後台欄位**。
 * 反面寫法是在每支技能的 JSON 裡各抄一個 4.5 —— 那是 115 個住處，
 * owner 下次想把「中」從 4.5 調成 5.0 就要改 115 個檔案。
 *
 * ── ⚠️ 這四個數字是**指定**的，不是「從分布推導」的 ────────────────────────
 * 誠實的說法：**6.0 與 8.0 來自 owner 指定的 24÷4 與 24÷3**（決鬥區半徑 24）；
 * **3.0 與 4.5 是挑的整數**。分位數只當事後健全性檢查（四個值都落在既有分布內），
 * ⛔ 不是推導依據。把「挑的」講成「量的」會讓真正量到的東西一起失去可信度。
 *
 * 支持它們的兩個**獨立**量測（互相自洽，所以值得相信的是**級距的形狀**）：
 *   · 英雄碰撞半徑 0.6（`spawnChampion.ts`，全英雄一致、不隨 bodyScale 變），
 *     AoE 命中是 body overlap → 半徑 r 實際觸及**圓心距離 r + 0.6** 的人。
 *   · 遊戲自己的英雄間距 4（`ArenaDef.ts` 出生點 z = −4/0/+4）。
 *     等圓堆積比推「5 人 / 10 人的最小外接半徑」在間距 3.6–4.0u 落在
 *     3.06–3.40 / 5.06–5.63 —— 與 owner 的 WC3 帶換算（小 1.83–3.67、
 *     中 3.67–5.50）**同時成立**。
 *
 * ── ⚠️ 「1/4 競技場」只在 authored 座標成立 ─────────────────────────────────
 * 出貨 `combatEnv.abilityRange` 是 **0.8**，所以「大 = 6」玩家實際看到的是
 * 4.8 = 決鬥區半徑的 **1/5**，不是 1/4。這一格是 owner 還沒答的決策題：
 * 他指定的比例是**卡面**還是**實際**？兩種都表達得出來（改這四個數字即可），
 * ⛔ 不要在程式裡替他選一邊。
 *
 * ── 換算係數（給從 w3x 帶數字過來的人）─────────────────────────────────────
 * `GGD_PER_WC3 = 11/600 = 0.0183333`（`templates/expand.ts`，29/29 支模板技驗證過）。
 * ⛔ 專案裡另外三處寫的係數**都是錯的**（第三守則），不要引用它們。
 */

import {
  DUEL_ZONE_RADIUS_REF,
  SKILL_TIER_NAMES,
  ladderWindow,
  type SkillTierName,
} from "./skillTiers";

/** `content/config/aoe-tiers.json` 的文件 id。 */
export const AOE_TIERS_DOC_ID = "aoe-tiers";

/**
 * 五個級別。⛔ 順序就是由小到大，後台下拉選單與文件共用這一份。
 *
 * ⭐ 2026-08-19（GH#414）起這**不是自己的一份陣列** —— 四軸共用
 * `skillTiers.ts` 的 {@link SKILL_TIER_NAMES}（owner：「正規化成五級距⋯
 * 文件 JSON 編輯器 後台設定 都統一」）。留這個別名是為了不動 30 幾處呼叫端。
 */
export const AOE_TIER_NAMES = SKILL_TIER_NAMES;
export type AoeTierName = SkillTierName;

export interface AoeTiers {
  /**
   * 止血閥。false = `radiusTier` 不解析（填了也不生效，但**看得見它是關的**）。
   *
   * ⚠️ 關掉它**不會**讓技能失去範圍 —— 手寫的 `radius` 一直都在，
   * 這一格只管「級別要不要被翻譯成半徑」。
   */
  enabled: boolean;
  /** 級別 → 半徑（GGD 單位）。五格都要有值。 */
  radius: Readonly<Record<AoeTierName, number>>;
}

/**
 * 出貨值。⚠️ 這五個數字與 `content/config/aoe-tiers.json` 必須一致，
 * `configDrift.test.ts` 那一族在守（第一守則的三個住處）。
 *
 * ⭐ **從梯子推導，⛔ 不抄字面值**（GH#414）：AoE 取橫木 [1..5]，
 * 於是 3 / 4.5 / 6 / 8 逐位元等於改制前的出貨值，第五格「極大」= R/2 = 12。
 * ⇒ 110 支填了 `radiusTier` 的技能**一支都沒有改變手感**。
 */
export const DEFAULT_AOE_TIERS: AoeTiers = Object.freeze({
  enabled: true,
  radius: ladderWindow(DUEL_ZONE_RADIUS_REF, 1),
});

/**
 * 單一級別半徑的上下界。`schema/config.ts` 與後台欄位共用這一組。
 *
 * 上界 **24 = 決鬥區半徑**：一個大於它的「範圍」就是全場命中，那不是範圍技，
 * 是「所有人」—— 而全場命中要走的是另一種寫法（不設 radius 的全域效果），
 * 不是把這一格填爆。⚠️ 出貨內容裡真的有兩支這種技能（皮卡娘 29.33、
 * 揍敵客桀諾 24），它們是**裸 `radius`**、不走這條路，見 GH#310。
 */
export const AOE_TIER_RADIUS_MIN = 0.5;
export const AOE_TIER_RADIUS_MAX = 24;

function clampRadius(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, AOE_TIER_RADIUS_MIN), AOE_TIER_RADIUS_MAX);
}

/** 把一份 `config.aoe-tiers@1` 文件正規化成級距表。認不得 → 出貨值。 */
export function aoeTiersFromDoc(doc: unknown): AoeTiers {
  const d = doc as { schema?: string; enabled?: unknown; radius?: Record<string, unknown> } | undefined;
  if (!d || d.schema !== "config.aoe-tiers@1") return DEFAULT_AOE_TIERS;
  const src = d.radius ?? {};
  const radius = {} as Record<AoeTierName, number>;
  for (const name of AOE_TIER_NAMES) {
    radius[name] = clampRadius(src[name], DEFAULT_AOE_TIERS.radius[name]);
  }
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_AOE_TIERS.enabled,
    radius: Object.freeze(radius),
  };
}

/**
 * 把一支技能上的 `radiusTier` 翻成 `radius`。
 *
 * ⭐ 這是**唯一**知道級別怎麼變成數字的地方 —— 註冊表、編輯器預覽、後台試算
 * 都呼叫它，而不是各自寫一次查表。兩份查表就是「編輯器顯示 4.5、
 * 場上打 6.0」的標準劇本。
 *
 * 規則（逐條都是決策點，寫在這裡而不是散在呼叫端）：
 *   · 沒有 `radiusTier` → 原樣返回。手寫 `radius` 是完全合法的寫法。
 *   · `enabled: false` → 原樣返回（級別不生效，但文件不會壞）。
 *   · **`radius` 與 `radiusTier` 同時存在 → 級別贏。**
 *     ⚠️ 這一格刻意不是「手寫值贏」：級別的用途就是把數字收回單一來源，
 *     讓手寫值蓋過它等於這個機制對那支技能不存在，而且**沒有人會發現**。
 *     要留住一個特例就不要填級別。
 */
export function resolveRadiusTier<T extends Record<string, unknown>>(def: T, tiers: AoeTiers): T {
  if (!tiers.enabled) return def;
  return walk(def) as T;

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;
    const rec = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) out[k] = walk(v);
    const tier = rec["radiusTier"];
    if (typeof tier === "string") {
      const r = tiers.radius[tier as AoeTierName];
      if (typeof r === "number") out["radius"] = r;
    }
    return out;
  }
}

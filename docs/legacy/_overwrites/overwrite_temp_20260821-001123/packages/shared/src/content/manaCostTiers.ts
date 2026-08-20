/**
 * 耗魔**五級距**（`config.mana-cost-tiers@1`，GH#446）—— 成本軸的第二條。
 *
 * owner 2026-08-19（逐字，這是這張表存在的理由）：
 * > Q4「**不用**（γ 超線性）已經有**傷害相應的冷卻跟耗魔**做限制」
 *
 * ⇒ owner 把「冷卻」與「耗魔」並列成兩條成本軸，而在 2026-08-21 之前
 * **只有冷卻有表**：420 支出貨技能各自帶一個手寫的耗魔陣列（中位 167.5、最大 999），
 * 沒有任何一支填得出級距，因為 `manaCostTier` 這個欄位根本不存在。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 這張表是**推導**出來的，⛔ 一個數字都不是挑的 —— 而且它與傷害表**共用同一條式子**
 *
 * `damageTiers.ts` 的推導鏈只有一個 owner 輸入：**20 發**（`KILL_CASTS_REF`）。
 * 那句話（「連續施展 20 次以內一定要能殺死對方」）同時約束了**兩件**事：
 *
 *     傷害：20 發要打得完一條中位血條   ⇒ 極小傷害 = 中位血量 ÷ 20
 *     耗魔：20 發要放得出來             ⇒ 極小耗魔 = 中位魔力 ÷ 20
 *
 * ⛔ 第二條在此之前沒有人寫下來，於是「20 次」這個規格只實現了一半：
 * 傷害表保證你打得死，而魔條保證你放不完。⭐ 兩條共用**同一個**輸入，
 * 所以這裡 ⛔ 沒有新的平衡旋鈕 —— 改 `KILL_CASTS_REF` 兩張表一起動。
 *
 * ① **極小** = `medianFinalMana(LV30) ÷ KILL_CASTS_REF`，**進位**到 `tierStep()`。
 *    ⚠️ 「引擎最終」魔力 = `純基礎中位 × env 倍率 ＋ 初始加成`，而**初始加成不參與倍率**
 *    （owner #273）—— 那條算式住 `balanceAnchors.medianFinalMana()`，⛔ 不在這裡重寫。
 *    ⚠️ 一定要**進位**：捨去會讓第 20 發放不出來，而且沒有任何東西會紅。
 *
 * ② **其餘四格** = 極小 × {@link tierRatios}（＝單體冷卻表的比例 1 / 2.5 / 5 / 7.5 / 10）。
 *    ⭐ 與傷害表**逐格同構**：一支「中」的技能，傷害是中、冷卻是中、耗魔也是中。
 *    那正是 owner Q4 的「傷害相應的冷卻跟耗魔」——三條軸同一個級別名，⛔ 不是三套刻度。
 *
 * ③ **錨點等級** = `HARD_ANCHOR_LEVEL`（LV30）。owner 2026-08-20：
 *    「**我的建議是拿 30 級的當標準就好**」。⛔ 不再是「滿足得了的最高那一個」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 上界 = **一發不可以吸乾整條魔條**
 *
 * `MANA_COST_TIER_MAX` = LV30 的引擎最終中位魔力。超過它的一格代表這支技能
 * 在 hard limit 那一級**永遠放不出來** —— 那不是一個耗魔級距，是一個無效宣稱
 * （第一·五守則）。⭐ 取**最早**會遇到它的那一級，理由與 `DAMAGE_TIER_MAX` 逐字相同。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 填了 `manaCostTier`，整條 `manaCost` 陣列就交出去了
 *
 * 級距是**一支技能一格**，⛔ 不是逐等級各一格（同 `cooldownTiers.ts`）。解析時
 * 每一階都被寫成同一個值 —— 想要「升階耗魔上升」的技能就**不要**填級距，
 * 手寫陣列一直都合法。
 */
import { HARD_ANCHOR_LEVEL, medianFinalMana } from "./balanceAnchors";
import { KILL_CASTS_REF, tierRatios, tierStep } from "./damageTiers";
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

/** `content/config/mana-cost-tiers.json` 的文件 id。 */
export const MANA_COST_TIERS_DOC_ID = "mana-cost-tiers";

/** 五個級別 —— 與其餘四軸**同一份**。⛔ 不要在這裡另立一組。 */
export const MANA_COST_TIER_NAMES = SKILL_TIER_NAMES;
export type ManaCostTierName = SkillTierName;

export interface ManaCostTiers {
  /**
   * 止血閥兼**一鍵 rollback**。false = `manaCostTier` 不解析，技能回到自己
   * 手寫的 `manaCost` 陣列。
   */
  enabled: boolean;
  /** 級別 → **卡面**耗魔。⚠️ 上場還要乘 `combatEnv` 那一條鏈。 */
  manaCost: Readonly<Record<ManaCostTierName, number>>;
}

/**
 * 單一格的上下界。
 * 下界 **0**：0 耗魔是一個**真的存在**的設計（天生技、切換技），⛔ 不是空宣稱 ——
 * 這一點與傷害軸相反（0 傷害的「傷害級距」什麼都不會發生）。
 * 上界 = hard limit 那一級的**引擎最終**中位魔力：超過它就是永遠放不出來。
 */
export const MANA_COST_TIER_MIN = 0;
export const MANA_COST_TIER_MAX = Math.floor(medianFinalMana(HARD_ANCHOR_LEVEL));

/**
 * 某一個錨點**要求**的極小耗魔 —— 「這一級的魔條要撐得住 owner 的 20 發」。
 * ⚠️ 進位到 {@link tierStep}，理由與傷害表同一條（五格全整數 + 卡面可讀）。
 */
export function manaAnchorFloor(pool: number): number {
  const step = tierStep();
  return Math.ceil(pool / KILL_CASTS_REF / step) * step;
}

/** 一個極小值展開成五格 —— 與單體冷卻表嚴格成正比（同傷害表）。 */
export function manaTiersFromAnchor(
  smallest: number,
): Readonly<Record<ManaCostTierName, number>> {
  const ratios = tierRatios();
  const out = {} as Record<ManaCostTierName, number>;
  for (const n of MANA_COST_TIER_NAMES) out[n] = Math.round(smallest * ratios[n]);
  return Object.freeze(out);
}

/** 出貨錨的魔力池（報告與後台說明從這裡讀，⛔ 不各自手寫）。 */
export const SHIPPED_MANA_POOL = medianFinalMana(HARD_ANCHOR_LEVEL);

/**
 * 出貨值。三個住處：`content/config/mana-cost-tiers.json` · 這裡 ·
 * `apps/admin` 的 `SHIPPED_*`。
 */
export const DEFAULT_MANA_COST_TIERS: ManaCostTiers = Object.freeze({
  enabled: true,
  manaCost: manaTiersFromAnchor(manaAnchorFloor(SHIPPED_MANA_POOL)),
});

/** 用出貨表把中位魔條放完要**幾發**這一級的技能（達成率表的唯一算式）。 */
export function castsPerPool(tier: ManaCostTierName): number {
  const c = DEFAULT_MANA_COST_TIERS.manaCost[tier];
  return c > 0 ? SHIPPED_MANA_POOL / c : Infinity;
}

function clampCost(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, MANA_COST_TIER_MIN), MANA_COST_TIER_MAX);
}

/** 把一份 `config.mana-cost-tiers@1` 文件正規化成級距表。認不得 → 出貨值。 */
export function manaCostTiersFromDoc(doc: unknown): ManaCostTiers {
  const d = doc as
    | { schema?: string; enabled?: unknown; manaCost?: Record<string, unknown> }
    | undefined;
  if (!d || d.schema !== "config.mana-cost-tiers@1") return DEFAULT_MANA_COST_TIERS;
  const src = d.manaCost ?? {};
  const manaCost = {} as Record<ManaCostTierName, number>;
  for (const name of MANA_COST_TIER_NAMES) {
    manaCost[name] = clampCost(src[name], DEFAULT_MANA_COST_TIERS.manaCost[name]);
  }
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_MANA_COST_TIERS.enabled,
    manaCost: Object.freeze(manaCost),
  };
}

/**
 * 把一支技能（或一件道具）上的 `manaCostTier` 翻成 `manaCost`。
 *
 * ⭐ 全專案**唯一**知道級別怎麼變成耗魔的地方（同 `resolveCooldownTier`）。
 *
 * 規則（逐條都是決策點，寫在這裡而不是散在呼叫端）：
 *   · 沒有 `manaCostTier` → 原樣返回。手寫 `manaCost` 是完全合法的寫法。
 *   · `enabled: false` → 原樣返回（＝一鍵回到舊的那一套耗魔）。
 *   · 沒有 `manaCost` 陣列可以蓋 → 原樣返回。⛔ 不憑空長出一格耗魔。
 *   · **兩格都填 → 級別贏**，而且每一階都寫同一個值（級距是一支技能一格）。
 *
 * ⚠️ 只看**頂層** —— `manaCost` 在 `ability@1` 是頂層欄位，而深走訪會讓一個
 * 內嵌在 effect 裡的 `manaCost`（例如 `spendMana`）被誤當成技能本身的耗魔。
 */
export function resolveManaCostTier<T extends Record<string, unknown>>(
  def: T,
  tiers: ManaCostTiers,
): T {
  if (!tiers.enabled) return def;
  const tier = def["manaCostTier"];
  if (typeof tier !== "string") return def;
  const mc = def["manaCost"];
  if (!Array.isArray(mc) || mc.length === 0) return def;
  const cost = tiers.manaCost[tier as ManaCostTierName];
  if (typeof cost !== "number") return def;
  return { ...def, manaCost: mc.map(() => cost) };
}

/**
 * ⭐⭐ **條件級距的唯一解析處**（GH#943）。
 *
 * owner 2026-09-02（逐字）：
 * > 「所有技能傷害（含升級）、AP加成、冷卻、距離、範圍、耗魔、**條件增幅**⋯
 * >  這些**全部都五級距化標籤化**（**條件表達也是模板標籤組合**）」
 *
 * ## ⭐ 它回答「這條係數有多難吃到」
 *
 * 一條「敵人低於 30% 血才吃」的係數，與一條**恆真**的係數，
 * ⛔ 在數值上不可以一樣重 —— ⭐ 而在此之前**沒有欄位表達這件事**。
 *
 * ## ⛔ 為什麼**不逐支填** —— ⭐ 這是它能落地的關鍵
 *
 * 2026-09-02 量到 **208 支**帶 AP 係數的技能，
 * ⭐ 而絕大多數**沒有任何條件結構** ⇒ 它們的答案**推導得出來**。
 *
 * ⇒ ⭐ 缺席時從**文件自己的結構**推導，⛔ 不是要人去 208 份檔各填一格
 * —— 那會是 208 個會過期的第二住處（第〇·四守則）。
 *
 * ## ⭐ 推導規則（⛔ 三行，而且每一行說得出理由）
 *
 * | 結構 | 級距 | 為什麼 |
 * |---|---|---|
 * | ⛔ 沒有 `when`／`condition` | **極小** | 恆真 ⇒ 乘數 1.0 ⇒ ⛔ 不該因為「有標籤」而變重或變輕 |
 * | 有條件，⛔ 而作者沒判斷難度 | **中** | ⭐ 一個**誠實的中間值** —— ⛔ 猜「很難」會讓它白拿係數 |
 * | ⭐ 作者填了 `conditionTier` | **照填的** | 作者比推導器知道得多（第〇·六守則：新版說明贏） |
 *
 * ⚠️ ⛔ 這一支**不決定乘數是多少** —— 那是 #942 的公式表（`content/config/`）。
 * ⭐ 它只決定**級距是哪一格**。
 */
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

/** ⭐ 沒有任何條件 ⇒ 恆真。 */
export const CONDITION_TIER_UNCONDITIONAL: SkillTierName = "極小";

/** ⭐ 有條件而作者沒判斷 ⇒ 誠實的中間值（⛔ 不猜「很難」）。 */
export const CONDITION_TIER_DEFAULT_WHEN_GATED: SkillTierName = "中";

/** 這一個 scaling 節點上有沒有**任何**條件結構。 */
export function scalingIsGated(scaling: unknown): boolean {
  if (scaling === null || typeof scaling !== "object") return false;
  const s = scaling as Record<string, unknown>;
  if (s["condition"] !== undefined && s["condition"] !== null) return true;
  const ratios = s["ratios"];
  if (Array.isArray(ratios)) {
    for (const r of ratios) {
      if (r !== null && typeof r === "object" && (r as Record<string, unknown>)["when"] !== undefined) {
        return true;
      }
    }
  }
  return false;
}

/**
 * ⭐ **唯一的查表入口**。缺席 ⇒ 推導；填了 ⇒ 照填的（⛔ 作者贏）。
 *
 * ⚠️ 回的是**級距名**，⛔ 不是乘數 —— 乘數住 `content/config/`（#942）。
 */
export function resolveConditionTier(scaling: unknown): SkillTierName {
  return resolveConditionTierFor(scaling, {});
}

/**
 * ⭐ 一條 ratio 的**上下文** —— 2026-09-06 owner「重新用公式判斷 看是不是判斷錯了」量到的三個盲點：
 *   · 條件是**逐條 ratio** 的（04-03 龍破斬同一個節點裡一條恆真、一條綁 EX 增幅，⛔ 以節點判會讓兩條同級）
 *   · 條件也住在**祖先 hook** 上（`onDamageTaken` 這一族要對手配合 ⇒ 極大；hook 自己的 `condition`）
 *   · **EX 槽位**本身就是計畫書 §1.4 的「大·EX／需蓄積」
 */
export interface ConditionTierContext {
  /** 這一條 ratio 自己（可能帶 `when`）。缺席 ⇒ 看節點上每一條。 */
  readonly ratio?: Readonly<Record<string, unknown>> | undefined;
  /** 由外而內的祖先鏈（hook 節點 `{ on, condition? }` 會在裡面）。 */
  readonly ancestors?: readonly Readonly<Record<string, unknown>>[] | undefined;
  /** 文件的槽位；`"EX"` ⇒ 至少「大」。 */
  readonly slot?: unknown;
}

/** ⭐ 「要對手配合」的 hook（計畫書 §1.4：反彈／迴避／格擋 ⇒ 極大）。 */
export const REACTIVE_HOOK_RE = /^on(DamageTaken|Damaged|Evade|Block|Reflect|HitTaken)/u;

function tierMax(a: SkillTierName, b: SkillTierName): SkillTierName {
  return SKILL_TIER_NAMES.indexOf(a) >= SKILL_TIER_NAMES.indexOf(b) ? a : b;
}

/**
 * ⭐ 一棵條件樹「有多難吃到」—— 計畫書 §1.4 的五格逐字：
 * 機率 ⇒ 小 · 狀態／屬性／裝備依賴 ⇒ 中 · 綁 EX 的 `recentCast`（惡夢碎片那一族）⇒ 大。
 * 複合（`all`／`any`／`not`）取子樹**最難**的那一格 —— ⛔ 不猜「很難」，但也⛔ 不把兩個條件當成一個。
 */
export function conditionTreeTier(when: unknown): SkillTierName {
  if (when === null || typeof when !== "object") return CONDITION_TIER_UNCONDITIONAL;
  const w = when as Record<string, unknown>;
  for (const group of ["all", "any"] as const) {
    if (Array.isArray(w[group])) {
      return (w[group] as unknown[]).reduce<SkillTierName>((t, c) => tierMax(t, conditionTreeTier(c)), CONDITION_TIER_UNCONDITIONAL);
    }
  }
  if (w["not"] !== undefined) return CONDITION_TIER_DEFAULT_WHEN_GATED;
  const kind = w["kind"];
  if (kind === "chance") return "小";
  if (kind === "recentCast" && (w["slot"] === "EX" || /\.ex$/u.test(String(w["abilityId"] ?? "")))) return "大";
  return CONDITION_TIER_DEFAULT_WHEN_GATED;
}

/**
 * ⭐⭐ **帶上下文的唯一查表入口**。作者填的永遠贏（ratio 上的先於節點上的）；
 * 其餘由 ratio 的 `when`、節點的 `condition`、祖先 hook、槽位**取最難的那一格**。
 */
export function resolveConditionTierFor(scaling: unknown, ctx: ConditionTierContext): SkillTierName {
  const declaredOf = (o: unknown): SkillTierName | undefined => {
    if (o === null || typeof o !== "object") return undefined;
    const d = (o as Record<string, unknown>)["conditionTier"];
    return typeof d === "string" && (SKILL_TIER_NAMES as readonly string[]).includes(d) ? (d as SkillTierName) : undefined;
  };
  const declared = declaredOf(ctx.ratio) ?? declaredOf(scaling);
  if (declared !== undefined) return declared;

  let t: SkillTierName = CONDITION_TIER_UNCONDITIONAL;
  if (scaling !== null && typeof scaling === "object") {
    const s = scaling as Record<string, unknown>;
    if (s["condition"] !== undefined && s["condition"] !== null) t = tierMax(t, conditionTreeTier(s["condition"]));
    if (ctx.ratio !== undefined) {
      if (ctx.ratio["when"] !== undefined) t = tierMax(t, conditionTreeTier(ctx.ratio["when"]));
    } else if (Array.isArray(s["ratios"])) {
      for (const r of s["ratios"] as unknown[]) {
        if (r !== null && typeof r === "object" && (r as Record<string, unknown>)["when"] !== undefined)
          t = tierMax(t, conditionTreeTier((r as Record<string, unknown>)["when"]));
      }
    }
  }
  for (const a of ctx.ancestors ?? []) {
    if (typeof a["on"] === "string" && REACTIVE_HOOK_RE.test(a["on"] as string)) t = tierMax(t, "極大");
    if (a["condition"] !== undefined && a["condition"] !== null) t = tierMax(t, conditionTreeTier(a["condition"]));
  }
  if (String(ctx.slot ?? "").toUpperCase() === "EX") t = tierMax(t, "大");
  return t;
}

/**
 * ⭐⭐ **宣告了級距卻沒有任何條件** —— ⛔ 那是一句說了不會發生的話
 * （第一·五守則）：卡面／契約宣稱「這條很難吃到」，⛔ 而它恆真。
 *
 * ⇒ 守衛 `tierTagCoverage.test.ts` 用它跑**反方向**。
 */
export function declaresTierWithoutCondition(scaling: unknown): boolean {
  if (scaling === null || typeof scaling !== "object") return false;
  const declared = (scaling as Record<string, unknown>)["conditionTier"];
  if (typeof declared !== "string") return false;
  // ⭐ 宣告成「極小」＝「恆真」⇒ 與沒有條件**一致**，⛔ 不算說謊。
  if (declared === CONDITION_TIER_UNCONDITIONAL) return false;
  return !scalingIsGated(scaling);
}

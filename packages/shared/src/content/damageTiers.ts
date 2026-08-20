/**
 * 傷害**五級距**（`config.damage-tiers@1`，GH#447）—— 四軸裡唯一的**回報**軸。
 *
 * owner 2026-08-19：
 * > Q1「假設最極端**單體 Q 傷害技能不帶負面狀態冷卻 6 秒**，
 * >   一回合**連續施展 20 次以內一定要能殺死對方**吧 不然也太爛了」
 * > Q3「**可以重新設計拉高**，畢竟之前檢討過 **AP 太弱勢**，
 * >   我們幾乎要拉到高等級才能開始追平普通攻擊無風險的傷害」
 * > Q4「**不用**（γ 超線性）已經有**傷害相應的冷卻跟耗魔**做限制」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 2026-08-20：這張表原本錨在 **Lv18**，而那是**錯的錨**
 *
 * owner 2026-08-20（逐字，對 #447 的更正）：
 * > 「我的錨點有講過是 **LV 30/50/99 三個**，至少要滿足 **30(hard limit)**，
 * >  能 **50 比較好(soft limit)**, **99 是極限**」
 *
 * 舊的五個數字（500/1250/2500/3750/5000）是拿 Lv18 的中位有效血量 9048 算的。
 * ⚠️ 它們不是「有點保守」——**血量比傷害長得快**（Lv18→LV99 中位有效血量 ×5.19，
 * 而中位滿階傷害只 ×2.14），所以一個錨在 Lv18 的表在 LV30 就已經**開始失效**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 這張表是**推導**出來的，⛔ 一個數字都不是挑的
 *
 * 三個輸入，三個都是 owner 給的或量到的：
 *
 *     KILL_CASTS_REF        = 20                    ← owner Q1「20 次以內一定要能殺死對方」
 *     MEDIAN_EFFECTIVE_HP   = {30:13927, 50:22437, 99:47008}
 *                                                   ← 量到的三個錨點中位有效血量
 *                                                     （`balanceAnchors.ts`，魔法側，裸裝，71 隻）
 *     DEFAULT_COOLDOWN_TIERS.seconds.單體 = [6,15,30,45,60]   ← owner 2026-08-19 給的冷卻表
 *
 * ① **一個錨點要求的下限（極小）**：`該級中位有效血量 ÷ 20`，
 *    **進位**到 50 的整數倍（`anchorFloor()`）。
 *    ⚠️ 一定要**進位**：捨去會差幾個 % 違反 owner 的 Q1，而且沒有任何東西會紅。
 *    ⇒ LV30 需要 **700** · LV50 需要 **1150** · LV99 需要 **2400**。
 *
 * ② **其餘四格**：`極小 × 單體冷卻 ÷ 6`，也就是**與冷卻表嚴格成正比**
 *    （`tiersFromAnchor()`）。⭐ 這正是 owner Q4 的意思 ——「已經有傷害相應的冷卻
 *    做限制」＝貴的技能貴在它落在冷卻表的哪一格，⛔ 不是靠一條沒有錨的 γ 超線性曲線。
 *    ⇒ 五格 = 極小 × 1 / 2.5 / 5 / 7.5 / 10。
 *
 * ③ **哪一個錨點出貨**：⭐ **滿足得了的最高那一個**（`pickAnchor()`）——
 *    這就是 owner 的 hard > soft > 極限 落地的樣子，⛔ 不是我在三個裡挑一個折衷。
 *    「滿足得了」的判準只有一條，而且它本來就寫在這個檔裡：
 *
 *        極大 ≤ DAMAGE_TIER_MAX（＝ hard limit 那一級的中位有效血量）
 *
 *    也就是**一發不可以秒殺 LV30 的中位英雄**。驗算：
 *
 *      | 錨 | 極小 | 極大 | ≤ 13927？ |
 *      |---|---:|---:|---|
 *      | LV30 | 700  | 7000  | ✅ |
 *      | LV50 | 1150 | 11500 | ✅ |
 *      | LV99 | 2400 | 24000 | ⛔ 是 LV30 中位血量的 **1.72 倍** —— 每一發極大都是即死 |
 *
 *    ⇒ 出貨錨 = **LV50**，五格 = **1150 / 2875 / 5750 / 8625 / 11500**。
 *    **hard ✅ · soft ✅ · 極限 ❌**（LV99 要 2400，被上面那條天花板擋在 1392 以下）。
 *
 * ⭐ 三個錨點各自的達成率（`castsToKill()`，⛔ 不要手抄 —— 它是算出來的）：
 *
 *     LV30  13927 ÷ 1150 = **12.1 發** ≤ 20  ✅ hard limit
 *     LV50  22437 ÷ 1150 = **19.5 發** ≤ 20  ✅ soft limit
 *     LV99  47008 ÷ 1150 = **40.9 發** > 20  ❌ 極限（差 2.04 倍）
 *
 * ⚠️ 極大 11500 ＝ LV30 中位有效血量的 **83%** / LV50 的 **51%** / LV99 的 **24%**。
 * LV30 那一格是刻意的：owner 說 AP 太弱勢，而量到的現況是**一發中位技能在 LV30
 * 只有血條的 5.3%**，要 **19 發**才打得死一個人 —— 同時普攻是**無風險**的。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 只有**一張**表，⛔ 沒有「單體一張、範圍一張」
 *
 * 形狀的代價**整個住在冷卻軸上**（範圍表比單體表貴 2–5×，`cooldownTiers.ts`）。
 * 再在傷害軸打一次折就是同一個懲罰收兩次。驗算：
 *
 *     單體·極大  5000 傷 ÷  60 卡面秒 = 83 每卡面秒 × 1 人   =  83
 *     範圍·極大  5000 傷 ÷ 120 卡面秒 = 42 每卡面秒 × 1.85 人 =  77
 *
 * 兩者在**每卡面秒的期望輸出**上幾乎相等 —— 一張表就夠了。
 * ⚠️ 但同樣的驗算在**範圍·極小**上是壞的（500 ÷ 30 × 1.33 = 22，只有單體極小的
 * 1/3.8）—— 那正是 GH#465 的來歷，而 owner 的答案是「那一格要求傷害是大／極大」，
 * ⛔ 不是「把傷害表拆成兩張」。相稱性住 `config.authoring-rules@1`。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 填了 `damageTier`，這一格的**基礎值就交出去了**
 *
 * `damageTier` 住在 `zScaling` 上（`amount: { damageTier: "中" }`），所以任何用
 * `Scaling` 的效果都吃得到 —— 一個機制，⛔ 不是 damage/damageArea/damageLine/dot/
 * chainLightning 各寫一份（第零守則⑨）。
 *
 * 解析時級距**取代** `flat` 與 `perRank`（⛔ 不是相加）—— 兩者相加會讓
 * 「填了級距卻比表大」變成一個沒有人發現得了的靜默偏差。
 * `ratios` / `attrRatios` **不動**：那兩條是**成長**，不是基礎值。
 */
import {
  BALANCE_ANCHOR_LEVELS,
  HARD_ANCHOR_LEVEL,
  MEDIAN_EFFECTIVE_HP,
  type BalanceAnchorLevel,
} from "./balanceAnchors";
import { DEFAULT_COOLDOWN_TIERS } from "./cooldownTiers";
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

/** `content/config/damage-tiers.json` 的文件 id。 */
export const DAMAGE_TIERS_DOC_ID = "damage-tiers";

/** 五個級別 —— 與其餘三軸**同一份**。⛔ 不要在這裡另立一組。 */
export const DAMAGE_TIER_NAMES = SKILL_TIER_NAMES;
export type DamageTierName = SkillTierName;

/**
 * owner Q1 的「連續施展幾次一定要能殺死對方」。⛔ 不是一個平衡旋鈕的預設值，
 * 是**這張表的輸入**。
 */
export const KILL_CASTS_REF = 20;

/** 進位的粒度 —— 讓下限落在 50 的整數倍上，⛔ 不是無條件捨去（見檔頭 ①）。 */
const ROUND_UP_TO = 50;

export interface DamageTiers {
  /**
   * 止血閥兼**一鍵 rollback**。false = `damageTier` 不解析，技能回到自己手寫的
   * `flat` / `perRank`（＝今天的那一套數字）。
   */
  enabled: boolean;
  /** 級別 → **卡面**基礎傷害。⚠️ 上場還要乘 `combatEnv.damageDealt` 與減免。 */
  damage: Readonly<Record<DamageTierName, number>>;
}

/**
 * 單一格的上下界。
 * 下界 **1**：0 傷害的「傷害級距」是一個空宣稱（第一·五守則）。
 * 上界 = **hard limit 那一級（LV30）的中位有效血量**：超過它的一發就是**一發秒殺**，
 * 而那不是一個傷害級距，是另一種設計 —— 要做的話走專門的機制，⛔ 不是把這一格填爆。
 *
 * ⭐ 為什麼取 **LV30** 而不是 LV50/LV99：一發要不要算「秒殺」，看的是**最早**
 * 會遇到它的那一級。錨在更高的等級 = 在 LV30 開一扇「這一發合法但它就是即死」的門。
 * ⇒ 這一條同時是 `pickAnchor()` 的天花板（見檔頭 ③）。
 */
export const DAMAGE_TIER_MIN = 1;
export const DAMAGE_TIER_MAX = MEDIAN_EFFECTIVE_HP[HARD_ANCHOR_LEVEL];

/** 某一個錨點**要求**的極小值：`該級中位有效血量 ÷ 擊殺次數`，**進位**到 50 的整數倍。 */
export function anchorFloor(level: BalanceAnchorLevel): number {
  return Math.ceil(MEDIAN_EFFECTIVE_HP[level] / KILL_CASTS_REF / ROUND_UP_TO) * ROUND_UP_TO;
}

/**
 * 一個極小值展開成五格 —— **與單體冷卻表嚴格成正比**（owner Q4）。
 * ⭐ 全專案唯一知道「五格之間的比例」的地方。
 */
export function tiersFromAnchor(smallest: number): Readonly<Record<DamageTierName, number>> {
  const cd = DEFAULT_COOLDOWN_TIERS.seconds["單體"];
  const base = cd[SKILL_TIER_NAMES[0]];
  const out = {} as Record<DamageTierName, number>;
  for (const n of DAMAGE_TIER_NAMES) out[n] = Math.round((smallest * cd[n]) / base);
  return Object.freeze(out);
}

/** 這個錨點**滿足得了嗎** —— 展開之後極大有沒有撞破「一發不可以秒殺」的天花板。 */
export function anchorIsSatisfiable(level: BalanceAnchorLevel): boolean {
  const t = tiersFromAnchor(anchorFloor(level));
  return t[DAMAGE_TIER_NAMES[DAMAGE_TIER_NAMES.length - 1]!] <= DAMAGE_TIER_MAX;
}

/**
 * 出貨要用哪一個錨點 —— ⭐ **滿足得了的最高那一個**。
 *
 * 這就是 owner 的 **hard > soft > 極限** 落地的樣子：hard limit 是**下限**
 *（就算它自己也撞天花板也照出貨，因為它「一定要滿足」），其餘每爬高一級都是白賺的。
 * ⛔ 不在三個裡挑一個折衷 —— 那是把排序權從 owner 手上拿走。
 */
export function pickAnchor(): BalanceAnchorLevel {
  let picked: BalanceAnchorLevel = HARD_ANCHOR_LEVEL;
  for (const level of BALANCE_ANCHOR_LEVELS) if (anchorIsSatisfiable(level)) picked = level;
  return picked;
}

/** 出貨表落在哪一個錨點上（報告與後台說明從這裡讀，⛔ 不各自手寫）。 */
export const SHIPPED_ANCHOR_LEVEL: BalanceAnchorLevel = pickAnchor();

/**
 * 用出貨表打死某一個錨點的中位英雄要**幾發極小**。
 * ⭐ 達成率表的唯一算式 —— `≤ KILL_CASTS_REF` 就是達成。
 */
export function castsToKill(level: BalanceAnchorLevel, smallest: number): number {
  return MEDIAN_EFFECTIVE_HP[level] / smallest;
}

/**
 * 出貨值。⭐ 從**三個錨點 + 冷卻表**推導（owner Q4「傷害相應的冷卻」），⛔ 不抄字面值。
 * 三個住處：`content/config/damage-tiers.json` · 這裡 · `apps/admin` 的 `SHIPPED_*`。
 */
export const DEFAULT_DAMAGE_TIERS: DamageTiers = Object.freeze({
  enabled: true,
  damage: tiersFromAnchor(anchorFloor(SHIPPED_ANCHOR_LEVEL)),
});

function clampDamage(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, DAMAGE_TIER_MIN), DAMAGE_TIER_MAX);
}

/** 把一份 `config.damage-tiers@1` 文件正規化成級距表。認不得 → 出貨值。 */
export function damageTiersFromDoc(doc: unknown): DamageTiers {
  const d = doc as
    | { schema?: string; enabled?: unknown; damage?: Record<string, unknown> }
    | undefined;
  if (!d || d.schema !== "config.damage-tiers@1") return DEFAULT_DAMAGE_TIERS;
  const src = d.damage ?? {};
  const damage = {} as Record<DamageTierName, number>;
  for (const name of DAMAGE_TIER_NAMES) {
    damage[name] = clampDamage(src[name], DEFAULT_DAMAGE_TIERS.damage[name]);
  }
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_DAMAGE_TIERS.enabled,
    damage: Object.freeze(damage),
  };
}

/**
 * 把每一格 `amount.damageTier` 翻成 `amount.flat`。
 *
 * ⭐ 全專案**唯一**知道級別怎麼變成傷害的地方（同 `resolveRadiusTier`）。
 * 走整棵樹，因為 `Scaling` 可以出現在任何一層 effect 上。
 *
 * 規則：
 *   · 沒有 `damageTier` → 原樣返回。
 *   · `enabled: false` → 整棵樹原樣返回（＝一鍵回到舊的那一套數字）。
 *   · 級距**取代** `flat` 與 `perRank`；`ratios` / `attrRatios` 不動（見檔頭）。
 */
export function resolveDamageTier<T extends object>(def: T, tiers: DamageTiers): T {
  if (!tiers.enabled) return def;
  return walk(def) as T;

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;
    const rec = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) out[k] = walk(v);
    const tier = rec["damageTier"];
    if (typeof tier === "string") {
      const v = tiers.damage[tier as DamageTierName];
      if (typeof v === "number") {
        out["flat"] = v;
        delete out["perRank"];
      }
    }
    return out;
  }
}

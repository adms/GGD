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
 * ⭐ 這張表是**推導**出來的，⛔ 一個數字都不是挑的
 *
 * 兩個輸入，兩個都是 owner 給的或量到的：
 *
 *     KILL_CASTS_REF     = 20      ← owner Q1「20 次以內一定要能殺死對方」
 *     EFFECTIVE_HP_REF   = 9048    ← 量到的 Lv18 中位有效血量
 *                                    (HP 8093 ÷ 魔法減傷 0.894，GH#447)
 *
 * ① **下限（極小）**：`9048 ÷ 20 = 452.4`。進位到 50 的整數倍 ⇒ **500**。
 *    ⚠️ 一定要**進位**：450 × 20 = 9000 < 9048，那會**差 0.5% 違反 owner 的 Q1**，
 *    而且沒有任何東西會紅。
 *
 * ② **其餘四格**：`500 × 單體冷卻 ÷ 6`，也就是**與冷卻表嚴格成正比**。
 *    ⭐ 這正是 owner Q4 的意思 ——「已經有傷害相應的冷卻做限制」＝
 *    貴的技能貴在它落在冷卻表的哪一格，⛔ 不是靠一條沒有錨的 γ 超線性曲線。
 *    ⇒ **500 / 1250 / 2500 / 3750 / 5000**（＝ 500 × 1 / 2.5 / 5 / 7.5 / 10）。
 *
 * ⚠️ 極大 5000 ≈ 中位有效血量的 **55%**。那是刻意的：owner 說 AP 太弱勢，
 * 而量到的現況是**一發中位技能只有血條的 5.9%**（532 / 9048），
 * 要 17 發才打得死一個人 —— 同時普攻是**無風險**的 69 DPS。
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

/**
 * 量到的 Lv18 **中位有效血量**（GH#447）：HP 8093 ÷ 魔法減傷 0.894。
 * ⚠️ 參考值，用來算 `DEFAULT_*`。真值隨英雄與裝備變動 —— 它在這裡的角色是
 * 「一發最少要多大」的錨，⛔ 不是一條上線後會被讀的規則。
 */
export const EFFECTIVE_HP_REF = 9048;

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

/** 極小那一格：`有效血量 ÷ 擊殺次數`，**進位**到 50 的整數倍。 */
function anchorDamage(): number {
  return Math.ceil(EFFECTIVE_HP_REF / KILL_CASTS_REF / ROUND_UP_TO) * ROUND_UP_TO;
}

/**
 * 出貨值。⭐ 從**冷卻表**推導（owner Q4「傷害相應的冷卻」），⛔ 不抄字面值。
 * 三個住處：`content/config/damage-tiers.json` · 這裡 · `apps/admin` 的 `SHIPPED_*`。
 */
export const DEFAULT_DAMAGE_TIERS: DamageTiers = Object.freeze({
  enabled: true,
  damage: (() => {
    const cd = DEFAULT_COOLDOWN_TIERS.seconds["單體"];
    const anchor = anchorDamage();
    const base = cd[SKILL_TIER_NAMES[0]];
    const out = {} as Record<DamageTierName, number>;
    for (const n of DAMAGE_TIER_NAMES) out[n] = Math.round((anchor * cd[n]) / base);
    return Object.freeze(out);
  })(),
});

/**
 * 單一格的上下界。
 * 下界 **1**：0 傷害的「傷害級距」是一個空宣稱（第一·五守則）。
 * 上界 = **中位有效血量**：超過它的一發就是**一發秒殺**，而那不是一個傷害級距，
 * 是另一種設計 —— 要做的話走專門的機制，⛔ 不是把這一格填爆。
 */
export const DAMAGE_TIER_MIN = 1;
export const DAMAGE_TIER_MAX = EFFECTIVE_HP_REF;

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

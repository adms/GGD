/**
 * 傷害規則（`config.damage-rules@1`）—— 今天只有一格：**技能傷害的預設型別**。
 *
 * owner 2026-08-05：「請把技能傷害預設都改成 AP 傷害」。
 *
 * ── ⚠️ 在這之前**沒有預設**，而那不是同一件事 ─────────────────────────────
 * `damageType` 在四個傷害 kind（`damage` / `damageArea` / `damageLine` / `dot`）
 * 上全部是**必填**。所以這次不是「把預設從 X 改成 Y」，是**新增**一個 ——
 * 在此之前每一張卡都必須自己講，只是實際上大多數講了 `magic`。
 *
 * 這個差別對作者有意義：以前忘了寫會被 Zod **擋在載入時**，
 * 現在忘了寫會**安靜地變成魔法傷害**。⛔ 那正是一個「卡片沒說、遊戲自己決定」
 * 的形狀，所以它必須是一格**看得到、改得到**的欄位而不是程式碼裡的常數 ——
 * 否則下一個問「為什麼我的技能吃魔抗」的人得去讀 sim 才找得到答案。
 *
 * ── 為什麼是 config 而不是寫死 ───────────────────────────────────────────
 * CLAUDE.md 第一守則：「如果我在寫程式時心裡出現『這裡要選 A 還是 B』，
 * 那就是一個決策點」。而這一格 owner 今天**才剛**做了一次選擇 ——
 * 一個剛被決定過的東西是最可能被再決定一次的東西。
 *
 * ⚠️ 它**不影響**任何已經明寫 `damageType` 的文件。出貨的技能絕大多數都寫了，
 * 所以打開這一頁改成 `physical` 不會把全樹翻過來 —— 它只管「沒寫的那些」。
 *
 * ⚠️ 而且它**不是**「技能吃 AP 加成」。傷害的**型別**（吃護甲還是魔抗）與
 * 傷害的**係數來源**（`Scaling` 讀 ap / ad / str / agi / int）是兩個獨立的欄位，
 * 這一格只管前者。一支「數字吃 AP、打出去是物理」的技能完全合法，
 * 而 WC3 原作裡那種組合很常見。
 */
import type { DamageType } from "./effects/effect";

/** `content/config/damage-rules.json` 的文件 id。 */
export const DAMAGE_RULES_DOC_ID = "damage-rules";

export interface DamageRules {
  /**
   * 一份傷害效果**沒寫** `damageType` 時用哪一種。
   *
   * 出貨 `magic`（owner 2026-08-05「技能傷害預設都改成 AP 傷害」）。
   */
  defaultAbilityDamageType: DamageType;
}

/**
 * 出貨值。
 *
 * ⚠️ **缺文件 = 這一份，不是空物件**（同 `DEFAULT_DISPEL_RULES` 的規矩）——
 * 一個 undefined 的型別會讓 `mitigate()` 走到沒有人設想過的分支。
 */
export const DEFAULT_DAMAGE_RULES: DamageRules = Object.freeze({
  defaultAbilityDamageType: "magic",
});

const TYPES: readonly DamageType[] = ["physical", "magic", "true"];

/**
 * 正規化操作者/文件給的表 —— 三層守衛的**最裡面**一層（同 `normalizeDispelRules`）：
 * 後台頁擋在前面、Zod 擋在中間，這裡擋的是任何繞過那兩層的來源。
 */
export function normalizeDamageRules(raw: unknown): DamageRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_DAMAGE_RULES;
  const t = (raw as { defaultAbilityDamageType?: unknown }).defaultAbilityDamageType;
  return TYPES.includes(t as DamageType)
    ? { defaultAbilityDamageType: t as DamageType }
    : DEFAULT_DAMAGE_RULES;
}

/** 從 `config.damage-rules@1` 文件讀出來。缺文件 = 出貨預設。 */
export function damageRulesFromDoc(doc: unknown): DamageRules {
  const d = doc as { schema?: string } | undefined;
  if (!d || d.schema !== "config.damage-rules@1") return DEFAULT_DAMAGE_RULES;
  return normalizeDamageRules(d);
}

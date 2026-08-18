/**
 * itemCardDerived —— 卡面上那些**推導出來的**數字，渲染時用真的管線重算一次。
 *
 * owner 2026-08-18：「請你**實作魔抗百分比**避免**數字誤差**及**過期**」
 *
 * ── 它在修什麼 ─────────────────────────────────────────────────────────────
 *
 * 三張卡上印著魔抗的**減傷百分比**，而那三個數字是用 `raw/(raw+100)` 手算的 ——
 * 少乘了 `combat-env` 的兩格倍率（`defense × magicResistMult`，出貨 1.0 × 0.2）：
 *
 *	祕銀鎖子甲   mr 66.7  卡面 40%     實際 **11.8%**
 *	消失的密室   mr 200   卡面 66.7%   實際 **28.6%**
 *	月牙魔杖     mr 200   卡面 66.7%   實際 **28.6%**
 *
 * ⚠️ 這是**兩種**錯，而且第二種比第一種嚴重：
 *   ① **誤差** —— 今天就是錯的。
 *   ② **過期** —— 就算今天改對，`magicResistMult` 是一格**後台旋鈕**，owner 動它的
 *      那一刻卡面又變成謊話，而且**沒有任何東西會叫**（第一·五守則的形狀）。
 *
 * ⇒ 所以修法**不是**把字面值改成 28.6。把一個推導值寫死進文案 = 給它開第四個住處，
 * 而那個住處沒有守衛。正解是**渲染的那一刻現算**：這裡吃 `mitigationMult()`
 * （傷害管線那一支唯一的曲線）與 `STAT_ENV_CHAIN[Stat.MagicResist]`（那兩格倍率
 * 的唯一定義）—— 旋鈕動了，卡面自己就跟著動。
 *
 * ── ⛔ 為什麼不改 JSON ─────────────────────────────────────────────────────
 *
 * 這三支在 owner 2026-08-01 親筆交來的 49 支裡，被
 * `legendary49OwnerText.test.ts` **逐位元組**釘死；`godie-i02d` 消失的密室當時還在
 * 禁改清單上。所以這個模組**一個位元都不碰 `content/`** —— 與 `itemCardText.ts`
 * 同一條規矩：原文是規格，排版與換算發生在渲染那一刻。
 *
 * ── 判準：整行**恰好**是「魔抗+N%」，而且這件道具真的有一條 `mr` flat ───────
 *
 * ⛔ 刻意**不**做「這一行有『魔抗』兩個字就換掉裡面的百分比」——
 * 終極魔改・不知火寫的是「破魔（魔抗 −50%）」，那是掛在**敵人**身上的減益倍率，
 * 不是這件道具給自己的抗性，換掉它會是一個新的謊話。整行比對 + 必須有 `mr` flat
 * 兩個條件任一個都能擋掉它（它兩個都不符合）。
 *
 * 突變紀錄：把 `envChainFactor` 的回傳改成常數 1（＝忘記乘後台倍率）→
 * `itemCardDerived.test.ts` 紅並指名三支道具的期望值；改回來 → 綠。
 */
import { Stat } from "../sim/stats/statTypes";
import {
  COMBAT_ENV_DEFAULTS,
  STAT_ENV_CHAIN,
  statEnvFactor,
  type CombatEnvMultipliers,
} from "../sim/combatEnv";
import { DEFAULT_MITIGATION_RULES, mitigationMult } from "../sim/combat/penetration";
import type { ItemCard, ItemCardLine } from "./itemCardText";

/** 一條 modifier 的最小形狀（⛔ 不 import `item@1` 的完整型別，這裡只讀三格）。 */
export interface DerivedModifier {
  readonly stat?: string;
  readonly op?: string;
  readonly value?: number;
}

export interface ItemCardDeriveContext {
  /** 這件道具自己的 modifiers（出貨 JSON 的那一份）。 */
  readonly modifiers?: readonly DerivedModifier[];
  /** 現行 combat-env。省略 = 出貨預設。 */
  readonly env?: CombatEnvMultipliers;
  /** 負抗性放大上限（`config.mitigation@1`）。省略 = 出貨預設。 */
  readonly negativeResistAmplifyCeiling?: number;
}

/** 一個 Stat 的 env 倍率鏈相乘。`byAttackType` 那一種在沒有 subject 時回中性 1。 */
export function envChainFactor(stat: Stat, env: CombatEnvMultipliers): number {
  let f = 1;
  for (const link of STAT_ENV_CHAIN[stat] ?? []) f *= statEnvFactor(link, env);
  return f;
}

/**
 * 一件道具**單獨**提供的魔法減傷百分比 —— 從 0 魔抗算起。
 *
 * ⭐ 「從 0 算起」是刻意的，而且正是 owner 原本的算法（200 → 200/300 = 66.7%）：
 * 減傷不是可加的，實際減多少取決於你身上的**總**魔抗，所以「這件裝備給你 X%」
 * 唯一講得清楚的讀法就是這個。這裡只補回他漏掉的那兩格倍率。
 */
export function magicResistMitigationPct(
  mrFlat: number,
  env: CombatEnvMultipliers = COMBAT_ENV_DEFAULTS,
  ceiling: number = DEFAULT_MITIGATION_RULES.negativeResistAmplifyCeiling,
): number {
  const effective = mrFlat * envChainFactor(Stat.MagicResist, env);
  return (1 - mitigationMult(effective, ceiling)) * 100;
}

/** 這件道具身上 `mr` 的 flat 總和；一條都沒有回 null。 */
function mrFlatOf(mods: readonly DerivedModifier[] | undefined): number | null {
  let sum = 0;
  let seen = false;
  for (const m of mods ?? []) {
    if (m.stat !== "mr" || m.op !== "flat" || typeof m.value !== "number") continue;
    sum += m.value;
    seen = true;
  }
  return seen ? sum : null;
}

/** 整行**恰好**是「魔抗+N%」／「魔法抗性+N%」。⛔ 行中內嵌的不算（見檔頭）。 */
const MR_LINE_RE = /^(魔抗|魔法抗性)\s*[+＋]\s*\d+(?:\.\d+)?\s*[%％]$/;

/** 最多一位小數，`.0` 去掉 —— 28.6 / 11.8 / 40。 */
function fmtPct(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function lineText(line: ItemCardLine): string {
  return line.tokens.map((t) => t.text).join("").trim();
}

/**
 * 把卡片上推導出來的數字換成真的。⛔ 沒有東西可換時**原封不動回同一個物件**
 * （呼叫端可以拿它做 identity 比較，也讓 99% 的道具零成本）。
 */
export function withDerivedNumbers(card: ItemCard, ctx: ItemCardDeriveContext): ItemCard {
  const mr = mrFlatOf(ctx.modifiers);
  if (mr === null) return card;
  const env = ctx.env ?? COMBAT_ENV_DEFAULTS;
  const ceiling = ctx.negativeResistAmplifyCeiling ?? DEFAULT_MITIGATION_RULES.negativeResistAmplifyCeiling;
  let changed = false;
  const efficacy = card.efficacy.map((line): ItemCardLine => {
    const m = MR_LINE_RE.exec(lineText(line));
    if (m === null) return line;
    changed = true;
    return {
      tokens: [
        { kind: "text", text: m[1]! },
        { kind: "num", text: `+${fmtPct(magicResistMitigationPct(mr, env, ceiling))}%` },
      ],
    };
  });
  return changed ? { ...card, efficacy } : card;
}

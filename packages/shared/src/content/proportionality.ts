/**
 * ⭐【GH#465】**相稱性** —— 成本軸（冷卻 × 形狀）反過來對回報軸（傷害）的要求。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 2026-08-20：這張表從**資料**變成**公式 + 一個係數**
 *
 * 它在 2026-08-19 是**十五格手填的資料**，而那一版的檔頭自己寫著：
 *
 * > 「⚠️ 而且它**推導不出來** —— 試過三條路⋯沒有一條同時重現
 * >   『單體·極小 → 極小』與『範圍·極小 → 大』。那代表 owner 的那一格帶著
 * >   『瞄準風險』這個**表上沒有的**輸入，所以它是**資料**不是公式。」
 *
 * ⭐ owner 2026-08-20 把**表上沒有的那個輸入**給了我（逐字）：
 *
 * > 「簡單粗暴的建議，**30/6秒=5，所以是 5 倍差距**，但由於是極小還是有可能位於
 * >  **2 個人的命中範圍，所以再除 2**，最後結論**約等於 2.5 倍**的這樣邏輯
 * >  來推演上下限的合理性範圍」
 *
 * ⇒ 缺的輸入是 **期望命中人數**（`expectedHits`），而它是一格後台欄位不是常數 ——
 * owner 自己已經把它從量到的 **1.33 人**改成 **2 人**（第一守則：他會再改）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 公式（一條，⛔ 不是十五格）
 *
 *     單位輸出率 unitRate = 傷害[極小] ÷ 冷卻[單體][極小]      （＝ 1150 ÷ 6）
 *     要求傷害  required(形狀, 級距)
 *              = unitRate × 冷卻[形狀][級距] ÷ 期望命中人數[形狀]
 *     最低傷害級距 = **第一個**值 ≥ required 的級距
 *
 * ⚠️ `unitRate` 不是我挑的常數 —— `content/damageTiers.ts` 的五格本來就是
 * 「極小 × 單體冷卻 ÷ 6」，也就是**同一個** unitRate。⇒ 單體那一列必然是
 * **對角線**（冷卻級距 T → 傷害級距 T），而那正是 owner Q4「已經有傷害相應的
 * 冷卻做限制」的另一種寫法。
 *
 * ⭐ 驗算 owner 給的係數：範圍·極小 required = (1150÷6) × 30 ÷ 2 = **2,875**，
 * 而單體·極小 required = (1150÷6) × 6 ÷ 1 = **1,150** ⇒ 比值 **2.5×** ——
 * 逐位元等於 owner 的「30/6=5，再除 2」。
 *
 * ⚠️ ⛔ 但它**沒有重現** owner 2026-08-19 手填的那一格（範圍·極小 → **大**）：
 * 公式給的是「**小**」（2,875），而「大」是 8,625 —— 差 **3.0 倍 / 兩級**。
 * ⛔ 我**沒有**去湊那個差（第〇·六守則：不能停就照階梯做下去 + 做成開關）：
 * 照階梯，2026-08-20 的公式是**比較新的第 1 層**，所以它贏並且**預設啟動**；
 * 舊的那一格另存在 {@link OWNER_20260819_CELL}，而 `expectedHits` 就是
 * 一鍵回頭的開關（把「範圍」填 0.67 就會回到「大」）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ `expectedHits = 0` ＝ **這個形狀不套相稱性**
 *
 * 出貨 `變身: 0`。理由不是「還沒填」：變身／長持續增益的**回報軸根本不是傷害**，
 * 對它要求一個最低傷害級距等於逼作者在一支變身技上填傷害。
 * ⇒ 0 是一個**語意**（豁免），⛔ 不是一個沒填完的坑。
 *
 * ⚠️ 違反只**警告不擋**（和 `authoringRules.ts` 的其餘 `principle` 同一層）——
 * owner 說的是「不合理」不是「不准」。
 */
import { COOLDOWN_SHAPES, type CooldownShape, type CooldownTiers } from "./cooldownTiers";
import { DAMAGE_TIER_NAMES, type DamageTierName, type DamageTiers } from "./damageTiers";
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

/** 期望命中人數的合法區間。0 ＝ 豁免（見檔頭）；上界 10 ＝ 一場最多的人數量級。 */
export const EXPECTED_HITS_MIN = 0;
export const EXPECTED_HITS_MAX = 10;

/** 形狀 → 一次命中幾個人（owner 2026-08-20：範圍 **2 人**）。 */
export type ExpectedHits = Readonly<Record<CooldownShape, number>>;

/**
 * 出貨值。⭐ 三個數字全部有出處：
 * · `單體: 1` —— 定義（單體就是打一個人）
 * · `範圍: 2` —— owner 2026-08-20「可能位於 **2 個人**的命中範圍」
 *   （⚠️ 量到的是 **1.33 人**；owner 自己把它進位成 2，那是他的裁決不是我的四捨五入）
 * · `變身: 0` —— 豁免：它的回報軸不是傷害
 */
export const DEFAULT_EXPECTED_HITS: ExpectedHits = Object.freeze({
  單體: 1,
  範圍: 2,
  變身: 0,
});

/**
 * owner 2026-08-19 手填的那**一格**（「的確是太小不合理，要綜合看傷害是不是
 * 極大或**至少大**的」）。
 *
 * ⛔ 留在這裡是因為第〇·六守則：「**分開不是丟掉**」——
 * 2026-08-20 的公式贏了並且預設啟動，但被它取代的那個判斷不可以無聲消失。
 * ⭐ 守衛 `skillCostTiers.test.ts` 讀這一格，把「公式重現不了它」這件事
 * **釘成一條會紅的斷言** —— 哪天公式或係數變到重現得了，它會叫。
 */
export const OWNER_20260819_CELL = Object.freeze({
  shape: "範圍" as CooldownShape,
  tier: SKILL_TIER_NAMES[0],
  damageTier: "大" as DamageTierName,
});

/** 對角線的錨：unitRate 從**這一格**取（單體·極小）。 */
const ANCHOR_SHAPE: CooldownShape = COOLDOWN_SHAPES[0];
const ANCHOR_TIER: SkillTierName = SKILL_TIER_NAMES[0];

/**
 * 一格要求的**傷害點數**（⛔ 不是級距名 —— 級距名由 {@link tierAtLeast} 決定）。
 * `expectedHits <= 0` ⇒ `0`（豁免，任何級距都過）。
 */
export function requiredDamage(
  seconds: CooldownTiers["seconds"],
  damage: DamageTiers["damage"],
  hits: ExpectedHits,
  shape: CooldownShape,
  tier: SkillTierName,
): number {
  const n = hits[shape];
  if (!(n > 0)) return 0;
  const anchorSec = seconds[ANCHOR_SHAPE]?.[ANCHOR_TIER];
  const anchorDmg = damage[ANCHOR_TIER];
  const sec = seconds[shape]?.[tier];
  if (!(anchorSec > 0) || !(anchorDmg > 0) || !(sec > 0)) return 0;
  return (anchorDmg / anchorSec) * (sec / n);
}

/**
 * **第一個**值 ≥ `want` 的傷害級距；全部都不夠就回最大的那一格。
 * ⚠️ 帶 1e-9 的容差：`required` 走過兩次浮點除法，`2875.0000000000005 > 2875`
 * 會讓一格無聲地跳到下一級（而畫面上完全看不出來）。
 */
export function tierAtLeast(
  damage: DamageTiers["damage"],
  want: number,
): DamageTierName {
  for (const name of DAMAGE_TIER_NAMES) {
    if (damage[name] + 1e-9 >= want) return name;
  }
  return DAMAGE_TIER_NAMES[DAMAGE_TIER_NAMES.length - 1]!;
}

/** 形狀 → 冷卻級距 → **最低**傷害級距。整張表，一條公式推出來。 */
export function deriveMinDamageTier(
  seconds: CooldownTiers["seconds"],
  damage: DamageTiers["damage"],
  hits: ExpectedHits,
): Record<CooldownShape, Record<SkillTierName, DamageTierName>> {
  const out = {} as Record<CooldownShape, Record<SkillTierName, DamageTierName>>;
  for (const shape of COOLDOWN_SHAPES) {
    const row = {} as Record<SkillTierName, DamageTierName>;
    for (const tier of SKILL_TIER_NAMES) {
      row[tier] = tierAtLeast(damage, requiredDamage(seconds, damage, hits, shape, tier));
    }
    out[shape] = row;
  }
  return out;
}

/** 一份 `expectedHits` 的正規化。認不得的形狀／值 → 出貨值。 */
export function expectedHitsFromDoc(raw: unknown): ExpectedHits {
  const rec = (raw ?? {}) as Record<string, unknown>;
  const out = {} as Record<CooldownShape, number>;
  for (const shape of COOLDOWN_SHAPES) {
    const v = rec[shape];
    out[shape] =
      typeof v === "number" && Number.isFinite(v)
        ? Math.min(Math.max(v, EXPECTED_HITS_MIN), EXPECTED_HITS_MAX)
        : DEFAULT_EXPECTED_HITS[shape];
  }
  return Object.freeze(out);
}

/**
 * ⭐【GH#445】**傷害太低的那幾格** —— 冷卻級距 × 形狀 的十五格裡，哪幾格
 * 「照對角線填傷害」會拿到比錨點低的每卡面秒輸出。
 *
 * owner 2026-08-20（逐字裁決）：
 *
 * > 「**傷害太低要跳出警告清單給我，後台跟 codex 編輯器也同步跳警告**」
 *
 * ⚠️ 他要的**不是**把那兩格的數值改掉（同一則裁決的另一半：出貨值一格都不動），
 * 而是**產出警告**：一份清單、後台頁、codex 契約，⛔ 不是只有一份文件。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 「傷害太低」是一個**推導出來的**判斷，⛔ 不是一張手寫的名單
 *
 * 一格的**期望輸出**（每一卡面秒打出去多少傷害）：
 *
 *     rate(形狀, 級距) = 傷害級距[同名那一格] × 期望命中人數[形狀] ÷ 冷卻[形狀][級距]
 *
 * 錨點是**對角線的起點**（單體・極小），因為傷害級距表本來就是拿它展開的
 *（`damageTiers.tiersFromAnchor()`：極小 × 單體冷卻比）。⇒ 單體那一列**恆等於**
 * 錨點，而 `deficitPct` 只可能在別的形狀上是負的。
 *
 * 偏低的形狀（⛔ 這裡刻意只寫**百分比**，不寫傷害數字 —— 百分比對級距的大小
 * 是**不變量**，而級距本身 owner 動過兩次；抄下來的絕對值會無聲過期）：
 *
 *     單體 五格                    ±0%（按定義）
 *     範圍・極小  傷害×2÷30 卡面秒   **−60%**
 *     範圍・小    傷害×2÷45 卡面秒   **−33%**
 *     範圍・中/大/極大              ±0%
 *     變身        expectedHits 0 ＝ 豁免（回報軸不是傷害）
 *
 * ⭐ 那兩個百分比是**算出來的**（`cellRate` ÷ `anchorRate`），⛔ 不是抄的字面值 ——
 * 而且它們**與錨點大小無關**：級距整條梯子縮放，比值一個位元都不會動。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 為什麼**門檻不是一格後台欄位**（第一守則的例外，而例外要有理由）
 *
 * 判準是「**低於錨點**」，⛔ 不是「低於某個我挑的百分比」。錨點是同一張傷害表
 * 自己的起點 ⇒ 這條規則沒有一個可以挑的數字。
 *
 * ⚠️ 而它仍然**完全是後台可調的**，只是旋鈕在上游：
 *   · 「期望命中人數」（`authoring-rules.proportionality.expectedHits`）
 *   · 冷卻五級距的十五格（`config.cooldown-tiers@1`）
 *   · 傷害五級距的五格（`config.damage-tiers@1`）
 * 動任何一格，這裡的名單與百分比下一秒就跟著動。
 * ⇒ 這裡再開一格門檻就是**第四個住處**，而它一定會跟上面三個說出不同的話。
 *
 * 要不要**跳**這條警告是一格開關：`config.new-hero-checks@1.rules["low-damage-cell"]`。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 這個檔案不碰 fs、不碰 DOM —— 語料由呼叫端餵進來（同 `newHeroDefaults.ts`）。
 *
 * 消費端（＝「這份推導真的有人讀」的證據）：
 *   · `newHeroChecks.ts` 的 `low-damage-cell` 規則 → 後台鑄英雄工坊 / 新英雄頁
 *   · `authoringRules.ts` → codex 編輯器的 `/authoring-rules` 端點與內嵌 profile
 *   · `tools/low-damage/gen.ts` → `docs/傷害偏低警告清單.md`（`pnpm lowdmg:check` 守著）
 *   · `newHeroDefaults.ts` → 生成的新技能**不會出生在**這幾格裡
 */
import {
  COOLDOWN_SHAPES,
  DEFAULT_COOLDOWN_TIERS,
  cooldownShapeOf,
  type CooldownShape,
  type CooldownTiers,
} from "./cooldownTiers";
import { DEFAULT_DAMAGE_TIERS, type DamageTierName, type DamageTiers } from "./damageTiers";
import { DEFAULT_EXPECTED_HITS, deriveMinDamageTier, type ExpectedHits } from "./proportionality";
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

/** 對角線的錨：單體・極小。⭐ 與 `proportionality.ts` 是**同一個**錨，⛔ 不另挑。 */
export const ANCHOR_SHAPE: CooldownShape = COOLDOWN_SHAPES[0];
export const ANCHOR_TIER: SkillTierName = SKILL_TIER_NAMES[0];

/**
 * 一格的期望輸出（每**卡面**秒）。
 * `expectedHits <= 0` ⇒ `0`（豁免：那個形狀的回報軸不是傷害）。
 */
export function cellRate(
  seconds: CooldownTiers["seconds"],
  damage: DamageTiers["damage"],
  hits: ExpectedHits,
  shape: CooldownShape,
  tier: SkillTierName,
): number {
  const n = hits[shape];
  const sec = seconds[shape]?.[tier];
  const dmg = damage[tier as DamageTierName];
  if (!(n > 0) || !(sec > 0) || !(dmg > 0)) return 0;
  return (dmg * n) / sec;
}

/** 錨點的期望輸出。 */
export function anchorRate(
  seconds: CooldownTiers["seconds"],
  damage: DamageTiers["damage"],
  hits: ExpectedHits,
): number {
  return cellRate(seconds, damage, hits, ANCHOR_SHAPE, ANCHOR_TIER);
}

/** 一格「傷害偏低」的完整說法 —— 每一欄都是算出來的。 */
export interface LowDamageCell {
  readonly shape: CooldownShape;
  readonly tier: SkillTierName;
  /** 這一格照對角線填傷害時的每卡面秒輸出 */
  readonly ratePerCardSecond: number;
  /** 錨點（單體・極小）的每卡面秒輸出 */
  readonly anchorRate: number;
  /** 相對錨點差幾 %（負數 = 偏低）。⚠️ 四捨五入到整數 —— 它是給人看的。 */
  readonly deficitPct: number;
  /** 對角線那一格的傷害級距（＝作者「照級距名填」會拿到的） */
  readonly diagonalDamageTier: DamageTierName;
  /** 相稱性要求的最低傷害級距（`proportionality.deriveMinDamageTier`） */
  readonly requiredDamageTier: DamageTierName;
}

/**
 * 十五格裡**傷害偏低**的那幾格。
 *
 * 判準：`rate < anchorRate`（豁免的形狀整列跳過）。
 * ⚠️ 浮點：用 `anchor * (1 - 1e-9)` 當界，⛔ 不是 `<`，否則單體那一列會因為
 * `(極小×15)/15` 這種除不盡的算式偶爾掉出來，而它在數學上是恆等的。
 */
export function lowDamageCells(
  seconds: CooldownTiers["seconds"] = DEFAULT_COOLDOWN_TIERS.seconds,
  damage: DamageTiers["damage"] = DEFAULT_DAMAGE_TIERS.damage,
  hits: ExpectedHits = DEFAULT_EXPECTED_HITS,
): readonly LowDamageCell[] {
  const anchor = anchorRate(seconds, damage, hits);
  if (!(anchor > 0)) return [];
  const required = deriveMinDamageTier(seconds, damage, hits);
  const out: LowDamageCell[] = [];
  for (const shape of COOLDOWN_SHAPES) {
    if (!(hits[shape] > 0)) continue; // 豁免
    for (const tier of SKILL_TIER_NAMES) {
      const rate = cellRate(seconds, damage, hits, shape, tier);
      if (!(rate > 0) || rate >= anchor * (1 - 1e-9)) continue;
      out.push(
        Object.freeze({
          shape,
          tier,
          ratePerCardSecond: rate,
          anchorRate: anchor,
          deficitPct: Math.round((rate / anchor - 1) * 100),
          diagonalDamageTier: tier as DamageTierName,
          requiredDamageTier: required[shape][tier],
        }),
      );
    }
  }
  return Object.freeze(out);
}

/**
 * 一支技能的**卡面**冷卻秒數落在哪一個級距 —— **最近**的那一格。
 *
 * ⚠️ 為什麼是「最近」而不是「≥」：出貨 358 支裡有 137 支的秒數不在格點上
 *（例 25 秒）。用 `≥` 會把 25 秒判成「小(45)」，而它離「極小(30)」近得多 ——
 * 那會讓警告指著錯的一格，而錯的警告會被下一個人關掉。
 * 平手時取**便宜**的那一格（`<` 才換），因為那是比較嚴格的結論。
 */
export function cooldownTierForSeconds(
  seconds: CooldownTiers["seconds"],
  shape: CooldownShape,
  sec: number,
): SkillTierName {
  const row = seconds[shape];
  let best: SkillTierName = SKILL_TIER_NAMES[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const tier of SKILL_TIER_NAMES) {
    const d = Math.abs((row?.[tier] ?? 0) - sec);
    if (d < bestD) {
      bestD = d;
      best = tier;
    }
  }
  return best;
}

/** 語料裡的一份技能文件 —— 只讀得懂這幾格。 */
export interface AbilityCellDoc {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly cooldown?: unknown;
  readonly cooldownTier?: unknown;
  readonly cooldownShape?: unknown;
  readonly [k: string]: unknown;
}

/** 一支技能落在哪一格，以及那一格偏低多少（`cell` 是 null ＝ 沒問題）。 */
export interface AbilityPlacement {
  readonly id: string;
  readonly name: string;
  readonly shape: CooldownShape;
  /** 用來判級距的卡面秒數 */
  readonly seconds: number;
  readonly tier: SkillTierName;
  readonly cell: LowDamageCell | null;
}

const firstRank = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (Array.isArray(v)) {
    for (const x of v) if (typeof x === "number" && Number.isFinite(x) && x > 0) return x;
  }
  return undefined;
};

/**
 * 一支技能落在十五格的哪一格。
 *
 * · 形狀 —— `cooldownShapeOf`（**同一支**判斷，⛔ 不在這裡重寫一份：兩份對
 *   「什麼算範圍技」一旦分岔，警告與實際查表就會指向不同的格子）。
 * · 秒數 —— 填了 `cooldownTier` 就用表上的秒數；否則用手寫 `cooldown` 的第一階。
 *   讀不到冷卻 ⇒ 回 `null`（⛔ 不是「它是 0」）。
 */
export function placeAbility(
  doc: AbilityCellDoc,
  cells: readonly LowDamageCell[],
  tiers: CooldownTiers = DEFAULT_COOLDOWN_TIERS,
): AbilityPlacement | null {
  const shape = cooldownShapeOf(doc as Record<string, unknown>, tiers);
  const declared = doc.cooldownTier;
  const tierFromDoc =
    typeof declared === "string" && (SKILL_TIER_NAMES as readonly string[]).includes(declared)
      ? (declared as SkillTierName)
      : undefined;
  const sec = tierFromDoc !== undefined ? tiers.seconds[shape][tierFromDoc] : firstRank(doc.cooldown);
  if (sec === undefined || !(sec > 0)) return null;
  const tier = tierFromDoc ?? cooldownTierForSeconds(tiers.seconds, shape, sec);
  return {
    id: typeof doc.id === "string" ? doc.id : "",
    name: typeof doc.name === "string" ? doc.name : "",
    shape,
    seconds: sec,
    tier,
    cell: cells.find((c) => c.shape === shape && c.tier === tier) ?? null,
  };
}

/** 一整批語料裡**落在偏低格**的那些，⭐ 順序穩定（格子順序 × 文件順序）。 */
export function abilitiesInLowDamageCells(
  docs: readonly AbilityCellDoc[],
  cells: readonly LowDamageCell[] = lowDamageCells(),
  tiers: CooldownTiers = DEFAULT_COOLDOWN_TIERS,
): readonly AbilityPlacement[] {
  const placed = docs
    .map((d) => placeAbility(d, cells, tiers))
    .filter((p): p is AbilityPlacement => p !== null && p.cell !== null);
  const order = (p: AbilityPlacement): number =>
    cells.findIndex((c) => c.shape === p.cell!.shape && c.tier === p.cell!.tier);
  return Object.freeze(
    [...placed].sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id)),
  );
}

/**
 * 一句話版本 —— ⭐ 後台說明、Codex 契約與產生的文件**共用這一段**，
 * ⛔ 三個地方各自寫一段就是三份會各自過期的散文。
 */
export function describeLowDamageCells(
  seconds: CooldownTiers["seconds"] = DEFAULT_COOLDOWN_TIERS.seconds,
  damage: DamageTiers["damage"] = DEFAULT_DAMAGE_TIERS.damage,
  hits: ExpectedHits = DEFAULT_EXPECTED_HITS,
): string {
  const cells = lowDamageCells(seconds, damage, hits);
  if (cells.length === 0) {
    return `⭐ 十五格目前**沒有一格**的期望輸出低於錨點（${ANCHOR_SHAPE}・${ANCHOR_TIER}）。`;
  }
  const body = cells
    .map(
      (c) =>
        `「${c.shape}・${c.tier}」${c.deficitPct}%（照對角線填「${c.diagonalDamageTier}」＝` +
        `${damage[c.diagonalDamageTier]} 傷害 × ${hits[c.shape]} 人 ÷ ${seconds[c.shape][c.tier]} 卡面秒 = ` +
        `${c.ratePerCardSecond.toFixed(1)}/秒；要追平錨點得跳到「${c.requiredDamageTier}」）`,
    )
    .join("；");
  return (
    `⚠️ **傷害偏低的 ${cells.length} 格**（相對錨點 ${ANCHOR_SHAPE}・${ANCHOR_TIER} 的 ` +
    `${anchorRate(seconds, damage, hits).toFixed(1)}/卡面秒）：${body}。` +
    `⭐ 全部是**算出來的**：改「期望命中人數」／冷卻五級距／傷害五級距任何一格，` +
    `這份名單下一秒就跟著動。⚠️ 只**警告不擋** —— owner 說的是「不合理」不是「不准」。`
  );
}

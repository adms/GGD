/**
 * ⭐⭐ **AP 係數的六維公式 —— 全專案唯一的求值處**（GH#942）。
 *
 * ```
 * coeff = base × globalMult × 冷卻 × 吟唱 × 距離 × 目標形狀 × 條件 × 基礎值補償
 * ```
 *
 * ## ⭐ 它與 `resolveCooldownTier` 同一族：**載入時解析**
 *
 * ⛔ 不是在產生器裡把數字烘進 148 份文件 —— 那正是這張票要拆掉的東西
 * （第〇·四守則：一個算得出來的值不可以有第二個住處）。
 *
 * ## ⛔ 缺席 ＝ 今天的行為，一個位元都不差
 *
 * `enabled: false`／表缺席 ⇒ 回 `null` ⇒ 呼叫端用文件上寫死的 `coeff`。
 * ⚠️ ⛔ 回 `null` 而不是 1.0 —— **1.0 是一個有意義的係數**。
 */
import type { SkillTierName } from "./skillTiers";
import { resolveConditionTierFor } from "./conditionTiers";
import { cooldownShapeOf, cooldownTiersFromDoc } from "./cooldownTiers";
import { zAbilityDef } from "./schema/ability";
import { zAbilityPassiveRank } from "./schema/effect";
import { dotPayoutsOf } from "./schema/effects/dot";

/**
 * ⭐ 一段 `dot` 整段燒完付幾次 —— ⭐ **住處在 `schema/effects/dot.ts`**（GH#1105 的 C）。
 * ⛔ 這裡只是轉出：`resourcePct` 的總量閘與這條公式的第七維在此之前**各抄了一份**。
 */
export { dotPayoutsOf };

export interface ApCoefficientConfig {
  readonly enabled: boolean;
  readonly base: number;
  readonly globalMult: number;
  readonly cooldownSlopeExp: number;
  readonly cooldown: { readonly normalizeToMidOfShape: boolean; readonly scale: number; readonly min: number; readonly max: number };
  readonly castTime: { readonly base: number; readonly slope: number; readonly capSec: number };
  readonly range: { readonly reference: number; readonly exponent: number; readonly selfCenteredAs: number };
  readonly shape: { readonly single: number; readonly line: number; readonly area: { readonly reference: number; readonly exponent: number } };
  readonly condition: Readonly<Record<SkillTierName, number>>;
  /**
   * ⭐ **第七維：發數**（owner 2026-09-06「多段技的發數維度」）。公式給的是**一次施放**的係數；
   * 住在多段容器（`randomArea.count` · `delayed.count` · `comboStrikes` 的每段＋收尾）底下的節點
   * 是**每一發**的係數 ⇒ 除以有效發數。`decayPerHit` 是 owner 2026-08-21「總計 = 每發 × 發數 × 遞減係數」
   * 的那個遞減（幾何）：1.0 ＝ 不遞減（有效發數 = 發數）。
   */
  readonly multiHit: { readonly enabled: boolean; readonly decayPerHit: number };
  /**
   * ⭐ 卡面上的 `{{ap}}` 印**公式解析後**的係數（true）還是文件手填的字面值（false）。
   * owner 2026-09-06：「96 張卡面寫著字面「N% [AP]」接上公式顯示 但可以後台開關」。
   * ⚠️ 只管**顯示**；場上跑的值由 `enabled` 決定。
   */
  readonly proseFromFormula: boolean;
  /**
   * ⭐ GH#1039（owner 2026-09-06「動態即時再技能說明試算後的數值」）：技能 tooltip 在每個基礎傷害後接
   * 「（目前 N）」—— N ＝ (基礎 ＋ 法強 × 係數) × damageDealt × 三段式乘數(法強)，法強讀當下的 `seat.apNow`。
   * false ⇒ 卡面只印基礎與係數（逐位元回到 v0.39.2）。⚠️ 只管顯示。
   */
  readonly proseLive: boolean;
  /**
   * ⭐⭐ **AP 係數是「一個邏輯節點一個值」還是「逐階可以不同」**（GH#1105 的 B）——
   * ⛔ 這是一個**決策點**，所以它是一格開關，⛔ 不是一個寫死在程式裡的選擇。
   *
   * | 值 | 語意 |
   * |---|---|
   * | `false`（出貨） | ⭐ **AP 係數是單一值**：公式的值蓋掉那個節點的**每一階**（＝ 2026-09-07 起的行為，逐位元不變） |
   * | `true` | ⭐ **一鍵回頭**：逐階手填**不一致**的那些節點（＝作者真的寫了階梯）公式**不覆蓋**，照作者寫的走 |
   *
   * ⭐ 為什麼預設是 `false`（⛔ 不是「我覺得比較好」，是 schema 說的）：
   * `ratios[].coeff` 是 `z.number()` —— ⭐ **一個數**，⛔ 它沒有 `perRank`。
   * 逐階成長的住處是**基礎值**那一側（`perRank` / `damageTierPerRank`），
   * ⇒ 一支主動技從來就寫不出「逐階不同的 AP 係數」；
   * `passive.ranks[]` 寫得出來只是因為**整份 payload 複製了 N 份**（＝儲存形狀的產物）。
   * ⚠️ 量到的母體：218 個邏輯節點裡**只有 1 個**（`godie-h02v.r` 手填 1/2/3 ＝ 0.46%）
   * 真的用它表達逐階 AP 成長。
   *
   * ⚠️ ⭐ 它同時決定**普查怎麼秤**：`false` ⇒ 一個邏輯節點一列（`apCoeffLogicalNodesOf`）；
   * `true` ⇒ 那 1 個節點真的有 3 個值，於是它在母體裡就是 3 列。
   */
  readonly keepAuthoredPerRankAp?: boolean;
  readonly baseTierCompensation: {
    readonly enabled: boolean;
    readonly byDamageTier: Readonly<Record<SkillTierName, number>>;
    readonly whenTierAbsent: number;
  };
}

/** ⭐ 出貨值 —— ⚠️ `base` 是**校準**出來的（見 schema 檔頭），⛔ 不是挑的。 */
export const DEFAULT_AP_COEFFICIENT: ApCoefficientConfig = Object.freeze({
  enabled: true,
  // ⭐⭐ 2026-09-07 第三次校準（GH#1102）：0.1619 → **0.2677**。⚠️ 改的**又是分母**，⛔ 不是水位。
  //   ⭐ `forEachApRatio` 在此之前只走 `def.effects` —— 一份**手寫的走訪清單**
  //   ⇒ 住 `passive` 的 67 條與住 `toggle` 的 1 條 AP ratio **整批看不到**
  //   （全庫 97 個 `onBasicAttack` hook 有 **92 個住 `passive`** ⇒ 普攻分支只服務得到 5 個）。
  //   ⇒ 走訪改成從 schema 推導（`apRatioRootKeys()`）⇒ 母體 **149 支／186 條 → 171 支／254 條**。
  //   ⚠️ 而新進來的那 68 條**系統性偏低**（多數是普攻 proc ⇒ 冷卻乘數走下限 0.15）
  //   ⇒ 公式幾何平均 0.6780 → 0.4101 ⇒ 校準比 **0.6048** ⇒ base × 1/0.6048。
  //   ⭐ 佐證（⛔ 不是只有一把尺）：`apCoeffDeviation` 的**中位偏離**從 0.607 回到 **1.0032**。
  //   ⚠️ 在此之前校準閘是**單邊**的（只 `toBeLessThan(1.05)`）⇒ 0.6048 會**靜靜地綠** ——
  //   同一輪把它改成兩邊都夾（CLAUDE.md：一把只驗過單邊的尺不算自證過）。
  // ⭐ 2026-09-07 第二次校準（owner「重新用公式判斷 看是不是判斷錯了來校正」）：0.1649 → **0.1619**。
  //   ⚠️ 這一次改的**不是水位，是分母**：校準普查在此之前掃磁碟上的原檔 ⇒ 191 支模板技的 AP 節點
  //   （住 `template.params`）整批看不到 ⇒ 母體 186 → 91 條，而消失的那一半係數系統性偏低。
  //   ⭐ runtime 是 `withTiers(expandIfTemplated(d))`（`registries.ts:245`）—— **展開在前**。
  //   ⇒ 普查改成展開後（＝ runtime 那個母體）⇒ 校準比 0.925 → 1.019 ⇒ base 0.1649 → 0.1619。
  //   ⛔ 上一輪讀出的「要校到 0.1783」是**對一個 runtime 不存在的母體**算的。
  base: 0.2677, // 2026-09-07 第六批再校準（80 支技能模板化 ⇒ 母體變了；公式常數一格沒動） // 2026-09-06 第二波再校準（#1058 三支條件式係數 ＋ #993 12 支還原 ⇒ 母體變了；0.1526 → 0.1442）
  globalMult: 1.0,
  cooldownSlopeExp: 1.0,
  cooldown: Object.freeze({ normalizeToMidOfShape: true, scale: 1.5, min: 0.15, max: 3.0 }),
  castTime: Object.freeze({ base: 1.0, slope: 0.5, capSec: 1.0 }),
  range: Object.freeze({ reference: 6.0, exponent: 0.35, selfCenteredAs: 3.0 }),
  shape: Object.freeze({ single: 2.5, line: 1.5, area: Object.freeze({ reference: 3.0, exponent: 0.5 }) }),
  condition: Object.freeze({ 極小: 1.0, 小: 1.3, 中: 1.6, 大: 2.2, 極大: 3.0 }),
  multiHit: Object.freeze({ enabled: true, decayPerHit: 1.0 }),
  proseFromFormula: true,
  proseLive: true,
  // ⭐ GH#1105 的 B —— 出貨 `false` ＝「AP 係數是單一值」（＝今天的行為，逐位元不變）。
  //   ⭐ `true` 是 owner 的一鍵 rollback：逐階手填不一致的節點保留作者寫的階梯。
  keepAuthoredPerRankAp: false,
  // ⭐⭐ 觸發頻率的三把尺（GH#939）—— owner 2026-09-02 **逐字核准的 15 個數字**：
  //   「我贊同你的新三類五級距（普攻 0.10/0.16/0.33/0.70/1.00 ·
  //    技能 0.30/0.50/0.60/0.80/1.00 · 特殊條件 0.50/0.60/1.20/3.00/7.00）」
  // ⛔ 沒有一格是我挑的（第一守則：出貨數值要引用得到他的原話）。
  frequency: Object.freeze({
    basicAttack: Object.freeze({ 極小: 0.1, 小: 0.16, 中: 0.33, 大: 0.7, 極大: 1.0 }),
    abilityCast: Object.freeze({ 極小: 0.3, 小: 0.5, 中: 0.6, 大: 0.8, 極大: 1.0 }),
    specialCondition: Object.freeze({ 極小: 0.5, 小: 0.6, 中: 1.2, 大: 3.0, 極大: 7.0 }),
  }),
  baseTierCompensation: Object.freeze({
    enabled: true,
    byDamageTier: Object.freeze({ 極小: 1.6, 小: 1.3, 中: 1.0, 大: 0.8, 極大: 0.6 }),
    whenTierAbsent: 1.3,
  }),
});

/** 一次求值需要知道的六件事 —— ⭐ 全部從**文件自己**推導得出來。 */
export interface ApCoeffInputs {
  /** 這一支的實際冷卻秒數。 */
  readonly cooldownSec: number;
  /** ⭐ 該形狀的「中」格秒數（正規化的分母）—— ⛔ 不是寫死 30。 */
  readonly midCooldownSec: number;
  /** ⭐ 吟唱秒數。⚠️ **被動一律 0**（GH#948：34 支被動帶著吟唱而它們沒有）。 */
  readonly castTimeSec: number;
  /** 施法距離；⛔ 0 ⇒ 用 `range.selfCenteredAs`。 */
  readonly rangeUnits: number;
  readonly shape: "single" | "line" | "area";
  /** `shape === "area"` 時的半徑。 */
  readonly radiusUnits?: number | undefined;
  readonly conditionTier: SkillTierName;
  /** ⭐ 第六維的輸入。缺席 ⇒ `whenTierAbsent`。 */
  readonly damageTier?: SkillTierName | undefined;
  /** ⭐ 第七維：這一條 ratio 一次施放會打幾發（多段容器）。缺席／1 ⇒ 不除。 */
  readonly hits?: number | undefined;
}

/** 幾何遞減下的有效發數：decay=1 ⇒ n；否則 (1−d^n)/(1−d)。 */
export function effectiveHits(n: number, decayPerHit: number): number {
  if (!(n > 1)) return 1;
  const d = Math.min(1, Math.max(0, decayPerHit));
  return d >= 1 ? n : (1 - Math.pow(d, n)) / (1 - d);
}

/**
 * ⭐ `config.combo-strikes@1` 每一族的**每段數**（`steps.length`）—— 連段的發數 = 每段 + 1 收尾。
 * 載入層／報表／棘輪共用（⛔ 不各讀一份）。
 */
export function comboStrikeCountsFrom(doc: unknown): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  const fams = (doc as { families?: unknown } | undefined)?.families;
  if (Array.isArray(fams))
    for (const f of fams as { key?: unknown; steps?: unknown }[])
      if (typeof f.key === "string" && Array.isArray(f.steps)) out[f.key] = f.steps.length;
  return out;
}

/**
 * ⭐ 這一條 ratio 一次施放會打幾發 —— 由**最近的**多段容器祖先決定：
 * `randomArea.count`（逐階陣列取第 1 階，與 `cooldown[0]` 同一個慣例）· `delayed.count` · `comboStrikes`
 * （家族表的每段數 + 1 收尾；作者自己寫 `strikes` 就照寫的）· ⭐ `dot`（整段的付款次數）。沒有容器 ⇒ 1。
 *
 * ⭐ **判準是「這個節點會產生幾次傷害事件」，⛔ 不是「它叫什麼名字」**（GH#1102）：
 * `dot` 在 2026-09-07 之前不在這張表上 ⇒ ⛔ 一段「每秒燒 10 跳」的 `amountPerTick`
 * 拿的是**一次施放**的整份係數，而它會付 10 次。
 * ⚠️ 同族前科（GH#1024）：`delayed{count:12}` 帶 `hitOncePerTarget` 被**多**算成 12 發 ——
 * ⭐ 那一次是多算，這一次是**沒算**，⛔ 而兩者都不會有任何東西紅。
 */
export function apCoeffHitsOf(
  ancestors: readonly Readonly<Record<string, unknown>>[],
  comboStrikeCounts: Readonly<Record<string, number>> = {},
): number {
  for (const a of [...ancestors].reverse()) {
    const kind = a["kind"];
    if (kind === "randomArea" || kind === "delayed") {
      // ⭐⭐ 容器自己宣告「同一個人整串只吃一次」⇒ 對**單一目標**而言這是 **1 發**，⛔ 不是 count 發。
      //   ⚠️ 第七維問的是「這一條 ratio 一次施放會打**同一個人**幾下」（owner 2026-09-06「多段技的發數維度」）——
      //   ⛔ 不是「這個容器結算幾次」。行進波（`tpl-traveling-wave`）的 12 段是**空間上往前推**，
      //   而 `delayed.ts:332` 在 `hitOncePerTarget` 時建一個 `struck` 集合把重複的人剔掉
      //   （守衛 `sim/effects/travelingWaveAdvance.test.ts` 逐字驗過去重）。
      //   ⛔ 不看這一格 ⇒ 34-04 蒼龍破被除以 12 ⇒ 係數 0.7 → **0.0275（0.04×）**，
      //   而模板自己的說明逐字寫著「同一個人整串只吃一次」。
      if (a["hitOncePerTarget"] === true) return 1;
      const c = a["count"];
      const n = Array.isArray(c) ? Number(c[0]) : Number(c);
      return Number.isFinite(n) && n > 1 ? n : 1;
    }
    // ⭐ GH#1102 —— 一段延燒的每一跳都是一次傷害事件（`dotPayoutsOf` 的推導見那一支）。
    if (kind === "dot") return dotPayoutsOf(a);
    if (kind === "comboStrikes") {
      const own = Number(a["strikes"]);
      const fam = typeof a["family"] === "string" ? comboStrikeCounts[a["family"] as string] : undefined;
      const steps = Number.isFinite(own) && own >= 1 ? own : (fam ?? 0);
      return steps + 1;
    }
  }
  return 1;
}

/** 六個乘數逐一算出來 —— ⭐ 拆開是為了讓守衛驗得到**每一維**，⛔ 不是只驗總和。 */
export function apCoeffTerms(
  i: ApCoeffInputs,
  c: ApCoefficientConfig = DEFAULT_AP_COEFFICIENT,
): Readonly<Record<string, number>> {
  const mid = c.cooldown.normalizeToMidOfShape && i.midCooldownSec > 0 ? i.midCooldownSec : 30;
  const raw = (i.cooldownSec / mid) * c.cooldown.scale;
  const cooldown = Math.min(c.cooldown.max, Math.max(c.cooldown.min, Math.pow(raw, c.cooldownSlopeExp)));
  const castTime = c.castTime.base + c.castTime.slope * Math.min(Math.max(i.castTimeSec, 0), c.castTime.capSec);
  const rng = i.rangeUnits > 0 ? i.rangeUnits : c.range.selfCenteredAs;
  const range = Math.pow(c.range.reference / rng, c.range.exponent);
  const shape =
    i.shape === "single"
      ? c.shape.single
      : i.shape === "line"
        ? c.shape.line
        : Math.pow(c.shape.area.reference / Math.max(i.radiusUnits ?? c.shape.area.reference, 0.01), c.shape.area.exponent);
  const condition = c.condition[i.conditionTier] ?? 1;
  // ⭐ 第七維：多段容器底下的每一發只拿一次施放係數的 1/有效發數。
  const multiHit = c.multiHit?.enabled && (i.hits ?? 1) > 1 ? 1 / effectiveHits(i.hits!, c.multiHit.decayPerHit) : 1;
  const baseComp = !c.baseTierCompensation.enabled
    ? 1
    : i.damageTier !== undefined
      ? (c.baseTierCompensation.byDamageTier[i.damageTier] ?? c.baseTierCompensation.whenTierAbsent)
      : c.baseTierCompensation.whenTierAbsent;
  return Object.freeze({ cooldown, castTime, range, shape, condition, baseComp, multiHit });
}

/**
 * ⭐⭐ **唯一的求值入口**。⛔ 關掉／表缺席 ⇒ `null`（呼叫端用文件寫死的值）。
 * ⚠️ ⛔ 回 `null` 而不是 1.0 —— 1.0 是一個**有意義**的係數。
 */
export function resolveApCoeff(
  i: ApCoeffInputs,
  c: ApCoefficientConfig = DEFAULT_AP_COEFFICIENT,
): number | null {
  if (!c.enabled) return null;
  const t = apCoeffTerms(i, c);
  const prod = t["cooldown"]! * t["castTime"]! * t["range"]! * t["shape"]! * t["condition"]! * t["baseComp"]! * t["multiHit"]!;
  return Math.round(c.base * c.globalMult * prod * 10000) / 10000;
}

/**
 * ⭐ 從**文件自己**湊出那六個輸入 —— ⛔ 呼叫端不必知道規則。
 * ⚠️ 被動的吟唱一律 **0**（GH#948）。
 */
export function apCoeffInputsFrom(
  ability: Record<string, unknown>,
  node: Record<string, unknown>,
  midCooldownSec: number,
  cooldownSec: number,
  ctx: ApNodeContext = {},
): ApCoeffInputs {
  // ⭐ 「被動 ⇒ 吟唱 0」只管**真的被動**（GH#948）：一支帶 `castType` 的天生技（14-00 召喚式神是
  //   `ground` 施放、吟唱 1.13s）是主動施放，它的吟唱是真的 —— 2026-09-06 owner 要我重判時量到。
  const isPassive = String(ability["slot"] ?? "").toUpperCase() === "PASSIVE" && ability["castType"] === undefined;
  const { shape, radiusUnits } = apCoeffShapeOf(ability, node, ctx.ancestors ?? []);
  return {
    cooldownSec,
    midCooldownSec,
    castTimeSec: isPassive ? 0 : Number(ability["castTimeSec"] ?? 0) || 0,
    rangeUnits: Number(ability["range"] ?? 0) || 0,
    shape,
    ...(radiusUnits !== undefined ? { radiusUnits } : {}),
    conditionTier: resolveConditionTierFor(node, { ratio: ctx.ratio, ancestors: ctx.ancestors, slot: ability["slot"] }),
    ...(typeof node["damageTier"] === "string"
      ? { damageTier: node["damageTier"] as SkillTierName }
      : {}),
    hits: apCoeffHitsOf(ctx.ancestors ?? [], ctx.comboStrikeCounts),
  };
}

/** 一條 ratio 在文件裡的位置 —— 祖先鏈（由外而內，⛔ 不含帶 ratios 的節點自己）與 ratio 自己。 */
export interface ApNodeContext {
  readonly ancestors?: readonly Readonly<Record<string, unknown>>[] | undefined;
  readonly ratio?: Readonly<Record<string, unknown>> | undefined;
  /** `config.combo-strikes@1` 的每段數表（`comboStrikeCountsFrom`）—— 連段的發數要它。 */
  readonly comboStrikeCounts?: Readonly<Record<string, number>> | undefined;
}

/**
 * ⭐⭐ **形狀乘數的唯一判準**（⛔ 2026-09-06 之前只看文件頂層 `radius` ⇒ 15 個住在 `damageArea` 底下的
 * 節點被判成單體 —— 13-04 龍星群就是）。由內而外找**最近**的帶形狀祖先（`damageLine` ⇒ 直線；
 * `damageArea`／`radius` ⇒ 範圍），都沒有才退到文件頂層 `radius`，再沒有 ⇒ 單體。
 * ⚠️ 這裡只管**形狀乘數**；冷卻要查哪一張表是**文件**的事（`cooldownShapeOf`，見 `apCoeffCooldownFor`）。
 */
export function apCoeffShapeOf(
  def: Record<string, unknown>,
  node: Readonly<Record<string, unknown>>,
  ancestors: readonly Readonly<Record<string, unknown>>[],
): { shape: ApCoeffInputs["shape"]; radiusUnits?: number | undefined } {
  for (const a of [node, ...[...ancestors].reverse()]) {
    if (a["kind"] === "damageLine") return { shape: "line" };
    if (a["kind"] === "damageArea" || typeof a["radius"] === "number") {
      const r = Number(a["radius"]) || undefined;
      return { shape: "area", ...(r !== undefined ? { radiusUnits: r } : {}) };
    }
  }
  const docR = Number(def["radius"] ?? 0) || undefined;
  if (docR !== undefined) return { shape: "area", radiusUnits: docR };
  return { shape: "single" };
}

/**
 * ⭐ 一棵 Zod 子樹裡**有沒有**一個帶 `ratios` 的物件 —— `apRatioRootKeys()` 的判準。
 * ⚠️ `seen` 是**必要**的：`zEffectDef` 是遞迴的（`z.lazy`），沒有它會無限展開。
 * ⚠️ `z.unknown()`（＝ `template.params` 的型別）**判 false** —— ⭐ 那正是我們要的：
 *   模板綁定裡的 AP 節點是**展開前**的來源，runtime 讀的是展開後的 `effects`
 *   （`registries.ts:245` `withTiers(expandIfTemplated(d))`）⇒ ⛔ 兩邊都算＝同一條 ratio 數兩次。
 */
function zodSubtreeHasRatios(schema: unknown, seen: Set<unknown>): boolean {
  if (schema === null || typeof schema !== "object" || seen.has(schema)) return false;
  seen.add(schema);
  const shape = zodObjectShape(schema);
  if (shape !== null && Object.prototype.hasOwnProperty.call(shape, "ratios")) return true;
  return zodChildren(schema).some((c) => zodSubtreeHasRatios(c, seen));
}

/** 一個 Zod 節點如果是物件 ⇒ 回它的 shape，否則 `null`。 */
function zodObjectShape(schema: unknown): Record<string, unknown> | null {
  const def = (schema as { _def?: Record<string, unknown> } | null)?._def;
  return def?.["typeName"] === "ZodObject" ? (schema as { shape: Record<string, unknown> }).shape : null;
}

/**
 * ⭐ 一個 Zod 節點的**直接子 schema** —— ⭐ 全檔**唯一**知道 zod 內部形狀的地方。
 * ⛔ 不要為了第二個問題再抄一份 switch（第〇·四守則）：`zodSubtreeHasRatios`（走訪根）與
 * `apRankArrayKeys`（rank 陣列）都問這一支。
 */
function zodChildren(schema: unknown): readonly unknown[] {
  const def = (schema as { _def?: Record<string, unknown> } | null)?._def;
  if (def === undefined) return [];
  const at = (k: string): unknown[] => (def[k] === undefined ? [] : [def[k]]);
  const list = (k: string): unknown[] => (Array.isArray(def[k]) ? (def[k] as unknown[]) : []);
  switch (def["typeName"] as string | undefined) {
    case "ZodObject":
      return Object.values(zodObjectShape(schema) ?? {});
    case "ZodArray":
    case "ZodPromise":
      return at("type");
    case "ZodSet":
    case "ZodRecord":
    case "ZodMap":
      return at("valueType");
    case "ZodOptional":
    case "ZodNullable":
    case "ZodReadonly":
    case "ZodBranded":
    case "ZodCatch":
    case "ZodDefault":
      return at("innerType");
    case "ZodEffects":
      return at("schema");
    case "ZodLazy":
      try {
        return [(def["getter"] as () => unknown)()];
      } catch {
        return [];
      }
    case "ZodUnion":
    case "ZodDiscriminatedUnion":
      return def["options"] instanceof Map
        ? [...(def["options"] as Map<unknown, unknown>).values()]
        : list("options");
    case "ZodIntersection":
      return [...at("left"), ...at("right")];
    case "ZodTuple":
      return list("items");
    case "ZodPipeline":
      return [...at("in"), ...at("out")];
    default:
      return [];
  }
}

/** 剝掉 optional／default／effects／lazy 這幾層包裝，露出真正的型別。 */
function zodUnwrap(schema: unknown): unknown {
  let s = schema;
  for (let i = 0; i < 32; i++) {
    const t = (s as { _def?: Record<string, unknown> } | null)?._def?.["typeName"];
    if (
      t === "ZodOptional" || t === "ZodNullable" || t === "ZodReadonly" ||
      t === "ZodBranded" || t === "ZodCatch" || t === "ZodDefault" ||
      t === "ZodEffects" || t === "ZodLazy"
    ) {
      const next = zodChildren(s);
      if (next.length === 0) return s;
      s = next[0];
    } else return s;
  }
  return s;
}

let ROOT_KEYS: readonly string[] | null = null;
/**
 * ⭐⭐ **`ap` ratio 住得進哪幾個頂層容器 —— 從 schema 推導**（GH#1102）。
 *
 * ⛔ 2026-09-07 之前這裡是一行 `walk(def["effects"])` —— ⭐ 一份**手寫的走訪清單**，
 * 而它漏了 `passive`：全庫 **97** 個 `onBasicAttack` hook 有 **92 個住 `passive`**
 * ⇒ ⛔ 公式的普攻分支只服務得到 5 個（5.2%），⛔ 而普查照樣印出一個看起來完整的統計。
 *
 * ⚠️ ⭐ **而那個盲點會獎勵錯誤的修法**：把一支技能改成純被動 ⇒ 它的 AP 節點
 * **直接離開母體** ⇒ 離群值「消失」了。⭐ 那是把缺陷改名字，⛔ 不是修好（GH#1100 第一版）。
 *
 * ⇒ ⭐ 清單從 `zAbilityDef` 的 shape 推導：**任何**頂層欄位，只要它的 Zod 子樹裡
 * 有一個帶 `ratios` 的物件就進來（今天推出 `effects` · `passive` · `marks` · `toggle`）。
 * ⛔ 不手寫「還要走哪幾格」——那是第二個住處，而它必然在下一次加容器時過期。
 */
export function apRatioRootKeys(): readonly string[] {
  if (ROOT_KEYS === null) {
    const shape = (zAbilityDef as unknown as { shape: Record<string, unknown> }).shape;
    ROOT_KEYS = Object.freeze(Object.keys(shape).filter((k) => zodSubtreeHasRatios(shape[k], new Set())));
  }
  return ROOT_KEYS;
}

let RANK_KEYS: ReadonlySet<string> | null = null;
/**
 * ⭐⭐ **哪幾格陣列的索引是「階」—— 從 schema 推導**（GH#1105 的 A）。
 *
 * ⛔ 問題（GH#1102 把母體修好之後才浮出來）：`passive.ranks[i]` 是**整份 payload 複製 N 份**
 * ⇒ 同一個邏輯節點在普查裡被數 **N 次**。⭐ 量到的：254 條 ap ratio 裡 **36 條**是階數複本
 * （13 個邏輯節點 × 3–4 階），而校準與離群棘輪把它們當成 36 個獨立節點在秤。
 *
 * ⇒ ⭐ 判準從 `zAbilityDef` 推導：**元素型別是 `zAbilityPassiveRank` 的那些陣列欄位**。
 * 今天推出 `["ranks"]` —— 它同時涵蓋 `passive.ranks` 與 `toggle.whileOn.ranks`
 * （兩者都是 `zAbilityPassive`），⛔ 而不必知道那兩條路徑。
 *
 * ⛔ **不可以寫成一份名單**（「這幾支算、那幾支不算」）—— 那是第二個母體定義，
 * 而它會在下一次有人加一個 rank 容器時靜默過期（GH#1102 的走訪根就是這樣壞掉的）。
 *
 * ⚠️ ⭐ **反方向量過**（`apCoefficient.test.ts`）：全庫 **67** 條 ap ratio 住在 rank 陣列底下、
 * 收成 **31** 個邏輯節點，而**沒有一個**邏輯節點的份數與它那份 `ranks` 的階數不同
 * ⇒ ⛔ 沒有任何一支技能靠 `ranks[]` 表達「不同的節點」（票文要求先確認的那一件事）。
 * ⭐ 而**同一份 `ranks` 底下路徑不同**的節點（`u034.r` 的三條 `branches[i]`）仍然各算各的 ——
 * 收合的是**索引**，⛔ 不是整個 `ranks` 子樹。
 */
export function apRankArrayKeys(): ReadonlySet<string> {
  if (RANK_KEYS === null) {
    const keys = new Set<string>();
    const seen = new Set<unknown>();
    const visit = (s: unknown): void => {
      if (s === null || typeof s !== "object" || seen.has(s)) return;
      seen.add(s);
      const shape = zodObjectShape(s);
      if (shape !== null)
        for (const [k, v] of Object.entries(shape)) {
          const arr = zodUnwrap(v) as { _def?: Record<string, unknown> } | null;
          if (arr?._def?.["typeName"] === "ZodArray" && zodUnwrap(arr._def["type"]) === zAbilityPassiveRank)
            keys.add(k);
        }
      for (const c of zodChildren(s)) visit(c);
    };
    visit(zAbilityDef);
    RANK_KEYS = keys;
  }
  return RANK_KEYS;
}

let DOMAIN_KEYS: readonly string[] | null = null;
/**
 * ⭐ **公式的定義域是「技能文件」** —— 而「是不是技能文件」也從 schema 推導：
 * `zAbilityDef` 的**必填**頂層欄位（id · name · slot · castType · maxRank · cooldown ·
 * manaCost · range · effects）一格不缺。
 *
 * ⚠️ ⭐ 這一格是 GH#1102 的**反方向**：走訪的根改成 schema 推導之後，`passive` 這個名字
 * 在 **item@1** 上也存在（13 條 ap ratio），`hooks` 在 **augment@1** 上也存在（9 條）——
 * ⛔ 而 `registries.ts:467/472` 對道具與增益卡也跑 `withTiers`。
 * ⇒ ⛔ 不設定義域 ＝ 22 條道具／增益卡係數被一支**用技能欄位算的**公式改寫
 *   （它們沒有 `cooldown`／`range`／`castTimeSec` ⇒ 六維全部落到退路值 ⇒ 幾乎每一條都變成 ~1.0）。
 * ⭐ 而它們**從來不在 `base` 的校準母體裡**（校準只掃 `content/abilities/`）⇒ 那是兩個空間混算。
 *
 * ⭐ 量到的：421 支 standalone ＋ 284 支英雄卡內嵌技能**全部**通過；
 * 142 份道具 ＋ 91 份增益卡**零通過** ⇒ 對它們逐位元 no-op（＝今天的行為）。
 */
export function apFormulaDomainKeys(): readonly string[] {
  if (DOMAIN_KEYS === null) {
    const shape = (zAbilityDef as unknown as { shape: Record<string, { isOptional(): boolean }> }).shape;
    DOMAIN_KEYS = Object.freeze(Object.keys(shape).filter((k) => !shape[k]!.isOptional()));
  }
  return DOMAIN_KEYS;
}

/** ⭐ 這份文件在不在公式的定義域裡（＝它是不是一份技能文件）。見 {@link apFormulaDomainKeys}。 */
export function isApFormulaDomain(def: Record<string, unknown>): boolean {
  return apFormulaDomainKeys().every((k) => def[k] !== undefined);
}

/**
 * ⭐ 走訪一份文件裡**每一條** `ap` ratio，帶著祖先鏈 —— 載入層、報表、棘輪三處共用（⛔ 不各寫一份會漂的走訪）。
 * ⭐ 根從 schema 推導（{@link apRatioRootKeys}），定義域也是（{@link isApFormulaDomain}）。
 */
export function forEachApRatio(
  def: Record<string, unknown>,
  visit: (
    node: Record<string, unknown>,
    ratio: Record<string, unknown>,
    ancestors: readonly Record<string, unknown>[],
    /**
     * ⭐ **這一條 ratio 屬於哪一個邏輯節點**（GH#1105 的 A）—— 文件內的路徑，
     * 而 **rank 陣列的索引收成 `[*]`**（`apRankArrayKeys()`，從 schema 推導）。
     * ⇒ `passive.ranks[0/1/2].hooks[0]…` 三份拿到**同一把 key**，
     * ⛔ 而同一份 `ranks` 底下**路徑不同**的節點（`branches[0]` vs `branches[1]`）仍然是兩把。
     */
    nodeKey: string,
  ) => void,
): void {
  if (!isApFormulaDomain(def)) return;
  const rankKeys = apRankArrayKeys();
  const walk = (o: unknown, anc: Record<string, unknown>[], path: string, collapse: boolean): void => {
    if (Array.isArray(o)) return o.forEach((v, i) => walk(v, anc, collapse ? `${path}[*]` : `${path}[${i}]`, false));
    if (!o || typeof o !== "object") return;
    const node = o as Record<string, unknown>;
    const ratios = node["ratios"];
    if (Array.isArray(ratios) && ratios.length > 0) {
      (ratios as Record<string, unknown>[]).forEach((r, ri) => {
        if (r["stat"] === "ap") visit(node, r, anc, `${path}.ratios[${ri}]`);
      });
    }
    const next = [...anc, node];
    for (const [k, v] of Object.entries(node)) walk(v, next, `${path}.${k}`, rankKeys.has(k));
  };
  for (const k of apRatioRootKeys()) walk(def[k], [], k, rankKeys.has(k));
}

/**
 * ⭐⭐ **一個邏輯節點一列** —— 把 rank 陣列的複本收合（GH#1105 的 A）。
 *
 * ⚠️ ⭐ 這一支的客戶是**普查／校準／棘輪**，⛔ 不是 runtime：場上每一階都要有一個值
 * （`resolveApCoeffOnDocWithTiers` 逐條寫），⭐ 而**秤**的時候一個節點只能算一次 ——
 * 玩家同一時間只有一個階級在身上。
 *
 * ⭐ `authoredCoeff` 取那幾階手填值的**幾何平均**，⛔ 不是「取第 1 階」：
 * 公式給的單一值會蓋掉**每一階**，而校準的統計本身就是幾何平均 ⇒ 兩邊同一個空間。
 * ⚠️ 出貨量到 13 個複本節點裡 **12 個逐階完全相同** ⇒ 這個選擇只動到 1 個節點
 * （`godie-h02v.r` 手填 1/2/3 ⇒ 1.8171）。
 */
export interface ApCoeffLogicalNode {
  readonly key: string;
  /** 這個邏輯節點的每一階副本（⛔ 不丟掉 —— 呼叫端要印哪一支就靠它）。 */
  readonly rows: readonly ApCoeffRow[];
  /** 手填值的幾何平均；一條正的手填值都沒有 ⇒ `null`。 */
  readonly authoredCoeff: number | null;
  /** 公式值（公式不看 rank ⇒ 每一階相同，取第一個）。 */
  readonly value: number | null;
  /** ⭐ 階與階的手填值**不一致** ＝ 作者用 `ranks[]` 表達逐階 AP 成長（全庫今天 1 個）。 */
  readonly authoredVariesByRank: boolean;
}

export function apCoeffLogicalNodesOf(rows: readonly ApCoeffRow[]): ApCoeffLogicalNode[] {
  const byKey = new Map<string, ApCoeffRow[]>();
  for (const r of rows) {
    const g = byKey.get(r.nodeKey);
    if (g) g.push(r);
    else byKey.set(r.nodeKey, [r]);
  }
  return [...byKey.entries()].map(([key, group]) => {
    const authored = group
      .map((r) => r.ratio["coeff"])
      .filter((c): c is number => typeof c === "number" && c > 0);
    return {
      key,
      rows: group,
      authoredCoeff:
        authored.length === 0
          ? null
          : Math.exp(authored.reduce((s, x) => s + Math.log(x), 0) / authored.length),
      value: group[0]!.value,
      authoredVariesByRank: new Set(authored.map((x) => x.toFixed(6))).size > 1,
    };
  });
}

/**
 * ⭐ 把**未解析**文件上的 ap 字面值抄回解析後的副本（只給卡面 `{{ap}}` 用；`proseFromFormula:false`）。
 * 兩份結構相同（解析只改 `coeff` 的值），逐條對位；條數對不上 ⇒ 原樣回傳解析後那份（fail-open，⛔ 不猜）。
 */
export function withLiteralApCoeffs<T extends Record<string, unknown>>(resolved: T, unresolved: Record<string, unknown>): T {
  const lit: number[] = [];
  forEachApRatio(unresolved, (_n, r) => { if (typeof r["coeff"] === "number") lit.push(r["coeff"] as number); });
  const clone = JSON.parse(JSON.stringify(resolved)) as T;
  const targets: Record<string, unknown>[] = [];
  forEachApRatio(clone, (_n, r) => { if (typeof r["coeff"] === "number") targets.push(r); });
  if (targets.length !== lit.length) return resolved;
  targets.forEach((r, i) => { r["coeff"] = lit[i]!; });
  return clone;
}

/** 一條 ratio 的完整求值紀錄 —— 報表與棘輪讀這個，⛔ 不自己重算輸入。 */
export interface ApCoeffRow {
  readonly node: Record<string, unknown>;
  readonly ratio: Record<string, unknown>;
  readonly ancestors: readonly Record<string, unknown>[];
  readonly inputs: ApCoeffInputs;
  readonly value: number | null;
  /** ⭐ 這一條屬於哪一個**邏輯節點**（rank 索引已收合）—— 見 {@link forEachApRatio} 的 `nodeKey`。 */
  readonly nodeKey: string;
}

/**
 * ⭐ 一份文件的每一條 `ap` ratio 逐條求值。`castTimeTiers` 給了就先把 `castTimeTier` 翻成秒
 * （載入層在 `withTiersCore` 已經翻過；報表讀的是磁碟上的原檔，⛔ 不翻會印出退路值）。
 */
export function apCoeffRowsOf(
  def: Record<string, unknown>,
  cooldownTiers: { seconds?: Record<string, Record<string, number>> } | undefined,
  c: ApCoefficientConfig = DEFAULT_AP_COEFFICIENT,
  castTimeTiers?: { enabled?: boolean; seconds?: Record<string, number> } | undefined,
  comboStrikeCounts: Readonly<Record<string, number>> = {},
): ApCoeffRow[] {
  const tier = def["castTimeTier"];
  const castSec = castTimeTiers?.enabled !== false && typeof tier === "string" ? castTimeTiers?.seconds?.[tier] : undefined;
  const doc = typeof castSec === "number" ? { ...def, castTimeSec: castSec } : def;
  const out: ApCoeffRow[] = [];
  forEachApRatio(doc, (node, ratio, ancestors, nodeKey) => {
    const { mid, sec } = apCoeffCooldownFor(doc, node, cooldownTiers, ancestors);
    const inputs = apCoeffInputsFrom(doc, node, mid, sec, { ancestors, ratio, comboStrikeCounts });
    out.push({ node, ratio, ancestors, inputs, value: resolveApCoeff(inputs, c), nodeKey });
  });
  return out;
}

/**
 * ⭐⭐ **把公式套到一份 ability 文件上**（GH#945）—— 載入時的那一層。
 *
 * ⭐ 2026-09-06 接上了（GH#1035，owner 逐字「全部技能接上公式」）：`registries.ts` 的 `withTiers`
 * **最外層**呼叫本函式 —— 四條路（standalone／英雄卡內嵌／模板展開／道具）只有這一個接縫。
 * ⚠️ 在此之前（#945 落地那一天到 2026-09-06）它自己也是零呼叫點 —— 失敗形態⑧ 第二次。
 *
 * ⛔⛔ 更早之前 `resolveApCoeff()` 是一支**零 production 消費端**的函式：
 * 公式做好了（GH#942）、BASE 校準過了、後台頁也有了 ——
 * ⭐ 而**沒有任何一行**在載入時呼叫它 ⇒ 樹上那 148 個手填的 `coeff` 原封不動。
 * ⚠️ 而 admin 那一頁的 `consumer` 欄位逐字寫著
 * 「← `content/registries.ts` 在技能註冊時把六個級距標籤翻成 `ratios[].coeff`」
 * ⇒ ⭐ **那句話是假的**（第三守則：一句在它到期之前就已經先寫下的散文）。
 *
 * ⭐ 這一支補上那一層，形狀照 `resolveCastTimeTierOnDoc`：
 * 純函式、規則由呼叫端傳、⛔ 不查 registry。
 *
 * ⚠️ ⭐ **關掉 `enabled` ⇒ 逐位元回到今天**（手填的 `coeff` 原封不動）——
 * 那是 owner 常設指令要的一鍵 rollback。
 */
/**
 * ⭐ 一份 ability 文件的「冷卻中位／冷卻秒數」—— **runtime 與報表共用**（⛔ 不各寫一份會漂的形狀判斷）。
 *
 * 形狀決定要查冷卻表的哪一欄（單體表最高 60s，範圍表可到 90/120；GH#942 的
 * `normalizeToMidOfShape`）。判法與 `tools/ap-coeff-apply/gen.ts` 過去的內嵌版逐字相同：
 * 有 `damageArea`／`radius` 的節點 ⇒ 範圍；文件提到 `championForm` ⇒ 變身；其餘單體。
 * ⭐ 以**節點**為單位（`resolveApCoeffOnDocWithTiers` 逐節點呼叫）。
 */
export function apCoeffCooldownFor(
  def: Record<string, unknown>,
  node: Record<string, unknown>,
  cooldownTiers: { seconds?: Record<string, Record<string, number>> } | undefined,
  ancestors: readonly Readonly<Record<string, unknown>>[] = [],
): { mid: number; sec: number } {
  const seconds = cooldownTiers?.seconds ?? {};
  // ⭐⭐ 冷卻表是**文件**的事，⛔ 不是節點的事：一支技能只有一個冷卻，而它查哪張表由 `cooldownShapeOf`
  //   （`resolveCooldownTier` 用的同一支）決定。2026-09-06 之前這裡以節點判 ⇒ **36 個**範圍技的 AP 節點
  //   查到單體表（極小 6s 而它們的冷卻其實是範圍·極小 30s）—— 14-00／42-01／53-03／38-02 四支的
  //   「0.1×」全是這一格造成的，⛔ 不是標籤錯（owner 2026-09-06「重新用公式判斷」量到）。
  //   ⚠️ 昨天那句「4 份混形文件要以節點判」是反的：edem.w 的冷卻 45s 本來就是範圍·小，以節點判才錯。
  const shape = cooldownShapeOf(def, cooldownTiersFromDoc(cooldownTiers));
  const mid = seconds[shape]?.["中"] ?? 30;
  // ⭐ 掛在 `onBasicAttack` 上的節點**每一下普攻都觸發** —— 它的「冷卻」是攻擊間隔，⛔ 不是那支 buff 的 60 秒。
  //   計畫書 §2 逐字：「普攻 ⇒ 冷卻 = 0.6 秒 ⇒ 冷卻乘數 0.15（下限）」⇒ 回 0，讓 `apCoeffTerms` 夾到下限
  //   （15-02 疾風迅雷的每下 10% AP 被判成一支 60 秒單體大招 ⇒ 22.7× —— 2026-09-06 owner 要我重判時量到）。
  if (ancestors.some((a) => a["on"] === "onBasicAttack")) return { mid, sec: 0 };
  const tier = def["cooldownTier"];
  const cd = def["cooldown"];
  const sec =
    typeof tier === "string" && seconds[shape]?.[tier] !== undefined
      ? seconds[shape]![tier]!
      : Array.isArray(cd) && cd.length > 0 && typeof cd[0] === "number"
        ? (cd[0] as number)
        : mid;
  return { mid, sec };
}

/**
 * ⭐ `resolveApCoeffOnDoc` 的**逐節點**版：冷卻中位／秒數由每一個帶 ratios 的節點自己的形狀決定
 * （`apCoeffCooldownFor`），⛔ 不是整份文件一組。這是 registries.ts 接線用的那一支（GH#1035）。
 */
export function resolveApCoeffOnDocWithTiers<T extends Record<string, unknown>>(
  def: T,
  cooldownTiers: { seconds?: Record<string, Record<string, number>> } | undefined,
  c: ApCoefficientConfig = DEFAULT_AP_COEFFICIENT,
  comboStrikeCounts: Readonly<Record<string, number>> = {},
): T {
  if (!c.enabled) return def;
  let touched = false;
  const clone = JSON.parse(JSON.stringify(def)) as T;
  // ⭐ 逐條 ratio 求值（⛔ 不是逐節點）：同一個節點裡恆真的那一條與綁 EX 增幅的那一條**不同級**（04-03 龍破斬）。
  forEachApRatio(clone, (node, r, ancestors) => {
    if (typeof r["coeff"] !== "number") return;
    const { mid, sec } = apCoeffCooldownFor(clone, node, cooldownTiers, ancestors);
    const v = resolveApCoeff(apCoeffInputsFrom(clone, node, mid, sec, { ancestors, ratio: r, comboStrikeCounts }), c);
    if (v !== null) {
      r["coeff"] = v;
      touched = true;
    }
  });
  return touched ? clone : def;
}

export function resolveApCoeffOnDoc<T extends Record<string, unknown>>(
  def: T,
  cooldownMidSec: number,
  cooldownSec: number,
  c: ApCoefficientConfig = DEFAULT_AP_COEFFICIENT,
): T {
  if (!c.enabled) return def;
  let touched = false;
  // ⚠️ ⭐ **就地改一份 clone**，⛔ 不是原文件：註冊表裡那一份會跨英雄、跨場次
  //   （`abilityPassives.ts` 的檔頭逐字記過同一個陷阱）。
  const clone = JSON.parse(JSON.stringify(def)) as T;
  // ⭐ 只動 `ap` 那一條（`forEachApRatio` 只送 ap）—— ⛔ `ad` / `maxHealth` 那些不在這條公式的定義域裡。
  forEachApRatio(clone, (node, r, ancestors) => {
    if (typeof r["coeff"] !== "number") return;
    const v = resolveApCoeff(apCoeffInputsFrom(clone, node, cooldownMidSec, cooldownSec, { ancestors, ratio: r }), c);
    if (v !== null) {
      r["coeff"] = v;
      touched = true;
    }
  });
  return touched ? clone : def;
}

/**
 * ⭐⭐ **這一支技能的觸發頻率屬於哪一類**（GH#939）。
 *
 * owner 2026-09-02（逐字）：
 * > 「AP 加成有比較多條件變因⋯**頻率[每次攻擊/技能施展/技能標籤變身反彈等特殊條件]**
 * >  ⋯請你提建議而非**一把尺抓平**」
 *
 * ⭐ **判準是推導的，⛔ 不是逐支標記**（第〇·四守則）：
 * · 掛在 `onBasicAttack` 上 ⇒ `basicAttack`（每秒都在觸發）
 * · 帶 `when` / hook `condition` / 變身 / 反彈 ⇒ `specialCondition`（玩家控制不了的前提）
 * · 其餘 ⇒ `abilityCast`（基準：一次施放要付冷卻與耗魔）
 *
 * ⚠️ ⭐ **順序是承重的**：一個「掛普攻**而且**帶條件」的節點算 `basicAttack` ——
 * ⛔ 因為決定它量級的是**頻率**，而條件只是把它乘上一個機率。
 * ⭐ 量到的實例（GH#946）：92-04 的 3.0×AP 帶著 `blind` 條件，
 * ⭐ 而它在 6 秒窗口內普攻約 4 次 ⇒ **等效 12×AP** ⇒ 它是 `basicAttack` 那一把尺的事。
 */
export type ApFrequencyClass = "basicAttack" | "abilityCast" | "specialCondition";

export function classifyApFrequency(
  /** 這一格 ratio 所在的**節點**（可能帶 `when`）。 */
  node: Readonly<Record<string, unknown>> | undefined,
  /** 承載它的 hook（`{ on: "onBasicAttack", condition?: … }`），沒有就傳 `undefined`。 */
  hook: Readonly<Record<string, unknown>> | undefined,
  /** 整份文件（用來看變身／反彈這一族）。 */
  doc: Readonly<Record<string, unknown>> | undefined,
): ApFrequencyClass {
  // ⭐ ① 普攻最優先 —— 見上面那段「順序是承重的」。
  if (hook?.["on"] === "onBasicAttack") return "basicAttack";
  // ⭐ ② 玩家控制不了的前提。
  if (node?.["when"] !== undefined) return "specialCondition";
  if (hook?.["condition"] !== undefined) return "specialCondition";
  if (typeof hook?.["on"] === "string" && /^on(Evade|Block|Reflect|Hit|Damaged|Kill)/u.test(hook["on"] as string))
    return "specialCondition";
  if (doc !== undefined && typeof doc["championForm"] === "string") return "specialCondition";
  // ⭐ ③ 基準。
  return "abilityCast";
}

/**
 * ⭐ 那一把尺在 `tier` 這一格給多少。
 * ⚠️ 級距名不在表上（或整格缺席）⇒ 回 `null`（「這一格沒有意見」）——
 * ⛔ 不是 0：0 的意思是「不吃 AP」，而那是**另一件事**。
 */
export function resolveApFrequencyTier(
  cls: ApFrequencyClass,
  tier: unknown,
  c: ApCoefficientConfig = DEFAULT_AP_COEFFICIENT,
): number | null {
  const table = (c as unknown as { frequency?: Record<string, Record<string, number>> }).frequency?.[cls];
  if (!table || typeof tier !== "string") return null;
  const v = table[tier];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

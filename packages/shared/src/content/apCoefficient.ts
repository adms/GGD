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
  readonly baseTierCompensation: {
    readonly enabled: boolean;
    readonly byDamageTier: Readonly<Record<SkillTierName, number>>;
    readonly whenTierAbsent: number;
  };
}

/** ⭐ 出貨值 —— ⚠️ `base` 是**校準**出來的（見 schema 檔頭），⛔ 不是挑的。 */
export const DEFAULT_AP_COEFFICIENT: ApCoefficientConfig = Object.freeze({
  enabled: true,
  base: 0.1526,
  globalMult: 1.0,
  cooldownSlopeExp: 1.0,
  cooldown: Object.freeze({ normalizeToMidOfShape: true, scale: 1.5, min: 0.15, max: 3.0 }),
  castTime: Object.freeze({ base: 1.0, slope: 0.5, capSec: 1.0 }),
  range: Object.freeze({ reference: 6.0, exponent: 0.35, selfCenteredAs: 3.0 }),
  shape: Object.freeze({ single: 2.5, line: 1.5, area: Object.freeze({ reference: 3.0, exponent: 0.5 }) }),
  condition: Object.freeze({ 極小: 1.0, 小: 1.3, 中: 1.6, 大: 2.2, 極大: 3.0 }),
  multiHit: Object.freeze({ enabled: true, decayPerHit: 1.0 }),
  proseFromFormula: true,
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
 * （家族表的每段數 + 1 收尾；作者自己寫 `strikes` 就照寫的）。沒有容器 ⇒ 1。
 */
export function apCoeffHitsOf(
  ancestors: readonly Readonly<Record<string, unknown>>[],
  comboStrikeCounts: Readonly<Record<string, number>> = {},
): number {
  for (const a of [...ancestors].reverse()) {
    const kind = a["kind"];
    if (kind === "randomArea" || kind === "delayed") {
      const c = a["count"];
      const n = Array.isArray(c) ? Number(c[0]) : Number(c);
      return Number.isFinite(n) && n > 1 ? n : 1;
    }
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
 * ⭐ 走訪一份文件裡**每一條** `ap` ratio，帶著祖先鏈 —— 載入層、報表、棘輪三處共用（⛔ 不各寫一份會漂的走訪）。
 */
export function forEachApRatio(
  def: Record<string, unknown>,
  visit: (node: Record<string, unknown>, ratio: Record<string, unknown>, ancestors: readonly Record<string, unknown>[]) => void,
): void {
  const walk = (o: unknown, anc: Record<string, unknown>[]): void => {
    if (Array.isArray(o)) return o.forEach((v) => walk(v, anc));
    if (!o || typeof o !== "object") return;
    const node = o as Record<string, unknown>;
    const ratios = node["ratios"];
    if (Array.isArray(ratios) && ratios.length > 0) {
      for (const r of ratios as Record<string, unknown>[]) if (r["stat"] === "ap") visit(node, r, anc);
    }
    const next = [...anc, node];
    for (const v of Object.values(node)) walk(v, next);
  };
  walk(def["effects"], []);
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
  forEachApRatio(doc, (node, ratio, ancestors) => {
    const { mid, sec } = apCoeffCooldownFor(doc, node, cooldownTiers, ancestors);
    const inputs = apCoeffInputsFrom(doc, node, mid, sec, { ancestors, ratio, comboStrikeCounts });
    out.push({ node, ratio, ancestors, inputs, value: resolveApCoeff(inputs, c) });
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

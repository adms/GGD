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
import { resolveConditionTier } from "./conditionTiers";

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
  readonly baseTierCompensation: {
    readonly enabled: boolean;
    readonly byDamageTier: Readonly<Record<SkillTierName, number>>;
    readonly whenTierAbsent: number;
  };
}

/** ⭐ 出貨值 —— ⚠️ `base` 是**校準**出來的（見 schema 檔頭），⛔ 不是挑的。 */
export const DEFAULT_AP_COEFFICIENT: ApCoefficientConfig = Object.freeze({
  enabled: true,
  base: 0.1312,
  globalMult: 1.0,
  cooldownSlopeExp: 1.0,
  cooldown: Object.freeze({ normalizeToMidOfShape: true, scale: 1.5, min: 0.15, max: 3.0 }),
  castTime: Object.freeze({ base: 1.0, slope: 0.5, capSec: 1.0 }),
  range: Object.freeze({ reference: 6.0, exponent: 0.35, selfCenteredAs: 3.0 }),
  shape: Object.freeze({ single: 2.5, line: 1.5, area: Object.freeze({ reference: 3.0, exponent: 0.5 }) }),
  condition: Object.freeze({ 極小: 1.0, 小: 1.3, 中: 1.6, 大: 2.2, 極大: 3.0 }),
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
  const baseComp = !c.baseTierCompensation.enabled
    ? 1
    : i.damageTier !== undefined
      ? (c.baseTierCompensation.byDamageTier[i.damageTier] ?? c.baseTierCompensation.whenTierAbsent)
      : c.baseTierCompensation.whenTierAbsent;
  return Object.freeze({ cooldown, castTime, range, shape, condition, baseComp });
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
  const prod = t["cooldown"]! * t["castTime"]! * t["range"]! * t["shape"]! * t["condition"]! * t["baseComp"]!;
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
): ApCoeffInputs {
  const isPassive = String(ability["slot"] ?? "").toUpperCase() === "PASSIVE";
  const kind = String(node["kind"] ?? "");
  const radius = Number(node["radius"] ?? ability["radius"] ?? 0) || undefined;
  const shape: ApCoeffInputs["shape"] =
    kind === "damageLine" ? "line" : kind === "damageArea" || radius !== undefined ? "area" : "single";
  return {
    cooldownSec,
    midCooldownSec,
    castTimeSec: isPassive ? 0 : Number(ability["castTimeSec"] ?? 0) || 0,
    rangeUnits: Number(ability["range"] ?? 0) || 0,
    shape,
    ...(radius !== undefined ? { radiusUnits: radius } : {}),
    conditionTier: resolveConditionTier(node),
    ...(typeof node["damageTier"] === "string"
      ? { damageTier: node["damageTier"] as SkillTierName }
      : {}),
  };
}

/**
 * ⭐⭐ **把公式套到一份 ability 文件上**（GH#945）—— 載入時的那一層。
 *
 * ⛔⛔ 在此之前 `resolveApCoeff()` 是一支**零 production 消費端**的函式：
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
export function resolveApCoeffOnDoc<T extends Record<string, unknown>>(
  def: T,
  cooldownMidSec: number,
  cooldownSec: number,
  c: ApCoefficientConfig = DEFAULT_AP_COEFFICIENT,
): T {
  if (!c.enabled) return def;
  let touched = false;
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    const node = o as Record<string, unknown>;
    const ratios = node["ratios"];
    if (Array.isArray(ratios) && ratios.length > 0) {
      const v = resolveApCoeff(apCoeffInputsFrom(def, node, cooldownMidSec, cooldownSec), c);
      if (v !== null)
        for (const r of ratios as Record<string, unknown>[])
          // ⭐ 只動 `ap` 那一條 —— ⛔ `ad` / `maxHealth` 那些不在這條公式的定義域裡。
          if (r["stat"] === "ap" && typeof r["coeff"] === "number") {
            r["coeff"] = v;
            touched = true;
          }
    }
    for (const v of Object.values(node)) walk(v);
  };
  // ⚠️ ⭐ **就地改一份 clone**，⛔ 不是原文件：註冊表裡那一份會跨英雄、跨場次
  //   （`abilityPassives.ts` 的檔頭逐字記過同一個陷阱）。
  const clone = JSON.parse(JSON.stringify(def)) as T;
  walk(clone["effects"]);
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

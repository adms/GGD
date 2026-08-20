/**
 * **收進級距**（`config.tier-snap@1`，GH#445 · #446 · #447）——
 * 把不在格點上的冷卻與耗魔靠到格點上。
 *
 * owner 2026-08-20（逐字，這一支的全部規格）：
 * > 「**收**：一次改掉 **137 支技能的冷卻也包括耗魔**，但**往前還是往後靠看傷害**，
 * >  **傷害低的往前靠、傷害高的往後靠**」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 為什麼它是**一個機制**，⛔ 不是 137 次手改
 *
 * 那 358 支技能的秒數是十年前從 w3x 匯進來的手寫值，它們從來沒跟 owner 2026-08-19
 * 給的 15 個格點對過。「改掉 137 支」有兩種做法：
 *
 *   ⛔ 逐支寫 `cooldownTier` 進 JSON —— 137 次編輯，而且**每新增一支技能就多一支**
 *      不在格點上的（doc §3.4）。⚠️ 其中 90 支還是 `tools/skill-remake/batch1.py`
 *      逐位元組擁有的檔，寫進去下一次重生成就被無聲蓋掉（GH#319 的形狀）。
 *   ✅ **一條註冊時的規則** —— 這個檔。舊技能、新技能、模板展開出來的技能
 *      走**同一個**接縫，而 owner 想回頭只要把 `enabled` 翻掉。
 *
 * 這就是第〇·五守則說的兩層：**機制**（靠攏規則）住引擎，**內容**（哪一格）住資料。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 靠攏方向：owner 給了規則，⛔ 沒有給那條線
 *
 * 「傷害低的往前靠、傷害高的往後靠」——「高/低」需要一個數字，而 owner 還沒給。
 * ⇒ 第一守則：**做成後台一格**，⛔ 不是我挑一個然後在註解裡辯護。
 *
 * `highDamageThreshold` **0 = 自動**，自動的值＝**全庫中位滿階傷害**
 *（`corpusDamageMedian()`，只算真的有傷害的那些）。
 * ⚠️ 為什麼預設是「自動」而不是一個數字：傷害五級距落地之後全庫傷害會**全面改寫**，
 * 一個當時量到的絕對值馬上就過期 —— 而且它會**用錯誤的訊息**過期（技能靠錯邊，
 * 而沒有任何東西會紅）。自動的那一格跟著語料走。owner 想釘死就填一個正數。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 上下限**沒有方向可選** —— 它們是夾，不是靠
 *
 * 秒數低於格點下限（例：範圍 3 秒 vs 下限 30 秒）或高於上限（例：單體 150 秒 vs
 * 上限 60 秒）時，「往前/往後」沒有兩個候選可挑，只有一個合法值。
 * ⇒ `outOfRange` 決定那時候要不要動它，出貨 `clamp`（＝ owner 的「收」）。
 * ⭐ 它獨立成一格是因為**那一批的幅度最大**（150 → 60 是砍掉 60%），
 * owner 要回頭時應該能只回頭這一批，⛔ 不必連整個機制一起關掉。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 耗魔的梯子是**推導**的，⛔ 不是我編的五個數字
 *
 * owner 2026-08-19 給了**兩個**耗魔錨（⛔ 不是五個）：
 * > 「範圍技**連續八次**施展完等回魔」　「連續**四個大範圍**技能施展完一定要等回魔」
 *
 * ⇒ 中 ＝ 魔力池 ÷ 8、大 ＝ 魔力池 ÷ 4。兩個錨相鄰一格且比值 2 ⇒ 幾何梯子
 * `池 ÷ {32, 16, 8, 4, 2}`。這與 AoE／施法距離／位移三軸**同一個做法**
 *（owner 給兩個錨，其餘由一條規則長出來）。
 *
 * ⚠️ 這條梯子**比傷害那條平**：極大÷極小 = 16 而不是 10 的⋯不，是**總量**不同 ——
 * 極大 ＝ 魔力池的一半，兩發清空魔條。⛔ 傷害那條梯子直接抄過來的話
 * 極大會比整個魔力池還大（`池÷8 × 10 = 池 × 1.25`），那支技能一輩子放不出來。
 */
import {
  COOLDOWN_SHAPES,
  DEFAULT_COOLDOWN_TIERS,
  cooldownShapeOf,
  type CooldownShape,
  type CooldownTiers,
} from "./cooldownTiers";
import { HARD_ANCHOR_LEVEL, medianFinalMana } from "./balanceAnchors";
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

/** `content/config/tier-snap.json` 的文件 id。 */
export const TIER_SNAP_DOC_ID = "tier-snap";

/** 超出格點上下限時怎麼辦。⛔ 沒有「往前/往後」—— 那時候只有一個合法值。 */
export const OUT_OF_RANGE_MODES = ["clamp", "keep"] as const;
export type OutOfRangeMode = (typeof OUT_OF_RANGE_MODES)[number];

/**
 * owner 2026-08-19 的兩條耗魔規格 —— **唯一**的兩個錨，其餘三格由比值長出來。
 * `tier` 是它落在哪一格，`casts` 是「連續幾次施展完要等回魔」。
 */
export const MANA_CAST_ANCHORS: readonly { readonly tier: SkillTierName; readonly casts: number }[] =
  Object.freeze([
    Object.freeze({ tier: SKILL_TIER_NAMES[2]!, casts: 8 }),
    Object.freeze({ tier: SKILL_TIER_NAMES[3]!, casts: 4 }),
  ]);

/**
 * 五格耗魔 —— 從魔力池與 owner 的兩個錨推導。
 *
 * ⭐ 極小那一格算完之後，其餘四格用**整數比**展開（同 `tiersFromAnchor`），
 * 這樣 `大 × 4 ≈ 池` 與 `中 × 8 ≈ 池` 兩條 owner 的規格才會同時成立 ——
 * 逐格各自四捨五入會讓它們差幾點而沒有人發現。
 */
export function manaTiersFromPool(pool: number): Readonly<Record<SkillTierName, number>> {
  const a = MANA_CAST_ANCHORS[0]!;
  const b = MANA_CAST_ANCHORS[1]!;
  const ia = SKILL_TIER_NAMES.indexOf(a.tier);
  const ib = SKILL_TIER_NAMES.indexOf(b.tier);
  // 每爬一格，「撐得住幾發」變成幾倍（owner 的兩個錨之間量出來的）。
  const perStep = ib === ia ? 1 : (b.casts / a.casts) ** (1 / (ib - ia));
  const castsAt = (i: number): number => a.casts * perStep ** (i - ia);
  const smallest = Math.max(1, Math.round(pool / castsAt(0)));
  const out = {} as Record<SkillTierName, number>;
  for (let i = 0; i < SKILL_TIER_NAMES.length; i++) {
    const ratio = castsAt(0) / castsAt(i);
    out[SKILL_TIER_NAMES[i]!] = Math.round(smallest * ratio);
  }
  return Object.freeze(out);
}

export interface TierSnap {
  /** 總開關兼**一鍵 rollback**。false = 整條規則不跑，技能保留手寫秒數與耗魔。 */
  enabled: boolean;
  /** 收冷卻。 */
  snapCooldown: boolean;
  /** 收耗魔 —— ⚠️ **只收被冷卻收到的那些**（owner：「137 支技能的冷卻**也包括**耗魔」）。 */
  snapManaCost: boolean;
  /** 超出格點上下限的那些要不要夾。 */
  outOfRange: OutOfRangeMode;
  /** 「傷害高」的界線。**0 = 自動**（全庫中位滿階傷害）。 */
  highDamageThreshold: number;
  /** 五格耗魔。 */
  manaCost: Readonly<Record<SkillTierName, number>>;
}

/** 出貨值。⭐ 耗魔五格從魔力池推導，⛔ 不抄字面值。 */
export const DEFAULT_TIER_SNAP: TierSnap = Object.freeze({
  enabled: true,
  snapCooldown: true,
  snapManaCost: true,
  outOfRange: "clamp" as OutOfRangeMode,
  highDamageThreshold: 0,
  manaCost: manaTiersFromPool(medianFinalMana(HARD_ANCHOR_LEVEL)),
});

/** 上下界。上界 = 魔力池：一發花光整條魔條已經是極端了，超過就是永遠放不出來。 */
export const MANA_TIER_MIN = 1;
export const MANA_TIER_MAX = Math.floor(medianFinalMana(HARD_ANCHOR_LEVEL));
/** 界線那一格的上界 —— 傷害級距的極大：比它還高的界線等於「全部往前靠」。 */
export const DAMAGE_THRESHOLD_MIN = 0;

/**
 * 一支技能的**滿階招牌傷害** —— 靠攏方向的唯一輸入。
 *
 * 取「所有傷害型 effect 的 amount 裡最大的那個數字葉」：
 *   · ⛔ 不加總 —— 一支技能打三段不代表它是三倍強的技能，而加總會讓多段技能
 *     全部被判成「高傷害」而往後靠（那正好與 owner 要的相反）。
 *   · ⛔ 不看 `ratios` / `attrRatios` —— 那兩條是**成長**，取決於玩家那一場的
 *     裝備，⛔ 不是卡面基礎值。
 *   · 沒有傷害 ⇒ **0**（＝「低」，往前靠）。輔助技能放勤一點是對的方向。
 */
const DAMAGE_KINDS: ReadonlySet<string> = new Set([
  "damage",
  "damageArea",
  "damageLine",
  "dot",
  "damageOverTime",
  "chainLightning",
]);

function amountMax(a: unknown): number {
  if (typeof a === "number") return Number.isFinite(a) ? a : 0;
  if (Array.isArray(a)) return a.reduce<number>((m, x) => Math.max(m, amountMax(x)), 0);
  if (a !== null && typeof a === "object") {
    let m = 0;
    for (const [k, v] of Object.entries(a as Record<string, unknown>)) {
      if (k === "ratios" || k === "attrRatios") continue;
      m = Math.max(m, amountMax(v));
    }
    return m;
  }
  return 0;
}

export function headlineDamage(def: unknown): number {
  let best = 0;
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x);
      return;
    }
    if (n === null || typeof n !== "object") return;
    const rec = n as Record<string, unknown>;
    const kind = rec["kind"];
    if (typeof kind === "string" && DAMAGE_KINDS.has(kind) && rec["amount"] !== undefined) {
      best = Math.max(best, amountMax(rec["amount"]));
    }
    for (const v of Object.values(rec)) walk(v);
  };
  walk((def as { effects?: unknown } | null)?.effects);
  return best;
}

/**
 * 「高/低」那條線的**自動**值 —— 全庫中位滿階傷害，⛔ 只算真的有傷害的那些。
 *
 * ⚠️ 把 0 傷害的輔助技能算進中位，中位會被拉到 0，於是**每一支都是「高」**，
 * 整批往後靠 —— 那與 owner 的規則剛好相反，而且不會有任何東西紅。
 */
export function corpusDamageMedian(docs: readonly unknown[]): number {
  const xs = docs.map(headlineDamage).filter((d) => d > 0).sort((a, b) => a - b);
  return xs.length === 0 ? 0 : xs[xs.length >> 1]!;
}

/** 這一批語料下，那條線實際是多少（0 = 自動 ⇒ 用中位）。 */
export function damageThreshold(snap: TierSnap, docs: readonly unknown[]): number {
  return snap.highDamageThreshold > 0 ? snap.highDamageThreshold : corpusDamageMedian(docs);
}

/** 靠攏的結果 —— `value` 是靠到哪，`why` 是給報告用的一句話。 */
export interface SnapResult {
  readonly value: number;
  readonly why: string;
}

/**
 * 把一個值靠到格點上。⭐ 全專案**唯一**知道「往前還是往後」的地方 ——
 * 冷卻與耗魔共用它，兩邊分岔就會出現「冷卻往後、耗魔往前」這種自相矛盾的技能。
 */
export function snapToGrid(
  value: number,
  grid: readonly number[],
  damage: number,
  threshold: number,
  outOfRange: OutOfRangeMode,
): SnapResult | null {
  if (grid.length === 0 || !(value > 0)) return null;
  const sorted = [...grid].sort((a, b) => a - b);
  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!;
  if (sorted.includes(value)) return null; // 已經在格點上
  if (value < lo) return outOfRange === "clamp" ? { value: lo, why: "低於下限⇒夾" } : null;
  if (value > hi) return outOfRange === "clamp" ? { value: hi, why: "超過上限⇒夾" } : null;
  const under = sorted.filter((g) => g < value).pop()!;
  const over = sorted.find((g) => g > value)!;
  return damage >= threshold
    ? { value: over, why: `傷害 ${damage} ≥ ${threshold}⇒往後靠` }
    : { value: under, why: `傷害 ${damage} < ${threshold}⇒往前靠` };
}

/** 一支技能落在哪一張冷卻表上（⛔ 不在這裡重寫一份判斷 —— 見 `cooldownShapeOf`）。 */
export function snapShapeOf(def: Record<string, unknown>, tiers: CooldownTiers): CooldownShape {
  return cooldownShapeOf(def, tiers);
}

const firstRank = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (Array.isArray(v)) for (const x of v) if (typeof x === "number" && Number.isFinite(x) && x > 0) return x;
  return undefined;
};

/** 一支技能被收成什麼樣（報告與註冊表共用**同一支**，⛔ 不各自算一次）。 */
export interface AbilitySnap {
  readonly shape: CooldownShape;
  readonly damage: number;
  readonly cooldownFrom: number;
  readonly cooldown: SnapResult | null;
  readonly manaFrom: number;
  readonly mana: SnapResult | null;
}

/**
 * 算一支技能要被收成什麼樣。⛔ 不改文件 —— 那是 `applyTierSnap` 的事。
 *
 * ⚠️ 耗魔**只在冷卻真的被收到時**才收（owner：「137 支技能的冷卻**也包括**耗魔」）。
 * 少了這一條，語料裡另外 221 支本來就在格點上的技能會被耗魔那一半掃到 ——
 * 那是 358 支不是 137 支，⛔ 不是 owner 說的那件事。
 */
export function planSnap(
  def: Record<string, unknown>,
  tiers: CooldownTiers,
  snap: TierSnap,
  threshold: number,
): AbilitySnap | null {
  if (!snap.enabled) return null;
  const shape = snapShapeOf(def, tiers);
  const cdFrom = firstRank(def["cooldown"]);
  if (cdFrom === undefined) return null;
  const damage = headlineDamage(def);
  const grid = SKILL_TIER_NAMES.map((t) => tiers.seconds[shape][t]);
  const cd = snap.snapCooldown
    ? snapToGrid(cdFrom, grid, damage, threshold, snap.outOfRange)
    : null;
  const mpFrom = firstRank(def["manaCost"]) ?? 0;
  const mpGrid = SKILL_TIER_NAMES.map((t) => snap.manaCost[t]);
  const mp =
    snap.snapManaCost && cd !== null && mpFrom > 0
      ? snapToGrid(mpFrom, mpGrid, damage, threshold, snap.outOfRange)
      : null;
  if (cd === null && mp === null) return null;
  return { shape, damage, cooldownFrom: cdFrom, cooldown: cd, manaFrom: mpFrom, mana: mp };
}

/**
 * 把 `planSnap` 的結論寫進文件。
 *
 * ⚠️ 只看**頂層** `cooldown` / `manaCost`（同 `resolveCooldownTier` 的理由）——
 * 深走訪會把內嵌在 effect 裡的 `cooldown`（例如 `modifyCooldown`）誤當成技能本身的。
 * ⚠️ 級距是**一支技能一格** ⇒ 每一階寫同一個值。想要逐階不同的技能，把
 * `enabled` 關掉（或讓它本來就落在格點上）。
 */
export function applyTierSnap<T extends Record<string, unknown>>(
  def: T,
  tiers: CooldownTiers,
  snap: TierSnap,
  threshold: number,
): T {
  const plan = planSnap(def, tiers, snap, threshold);
  if (plan === null) return def;
  const out: Record<string, unknown> = { ...def };
  if (plan.cooldown !== null && Array.isArray(def["cooldown"])) {
    out["cooldown"] = (def["cooldown"] as unknown[]).map(() => plan.cooldown!.value);
  } else if (plan.cooldown !== null && typeof def["cooldown"] === "number") {
    out["cooldown"] = plan.cooldown.value;
  }
  if (plan.mana !== null && Array.isArray(def["manaCost"])) {
    out["manaCost"] = (def["manaCost"] as unknown[]).map(() => plan.mana!.value);
  } else if (plan.mana !== null && typeof def["manaCost"] === "number") {
    out["manaCost"] = plan.mana.value;
  }
  return out as T;
}

/** 把一份 `config.tier-snap@1` 文件正規化。認不得 → 出貨值。 */
export function tierSnapFromDoc(doc: unknown): TierSnap {
  const d = doc as
    | {
        schema?: string;
        enabled?: unknown;
        snapCooldown?: unknown;
        snapManaCost?: unknown;
        outOfRange?: unknown;
        highDamageThreshold?: unknown;
        manaCost?: Record<string, unknown>;
      }
    | undefined;
  if (!d || d.schema !== "config.tier-snap@1") return DEFAULT_TIER_SNAP;
  const bool = (v: unknown, fb: boolean): boolean => (typeof v === "boolean" ? v : fb);
  const src = d.manaCost ?? {};
  const manaCost = {} as Record<SkillTierName, number>;
  for (const t of SKILL_TIER_NAMES) {
    const v = src[t];
    manaCost[t] =
      typeof v === "number" && Number.isFinite(v)
        ? Math.min(Math.max(v, MANA_TIER_MIN), MANA_TIER_MAX)
        : DEFAULT_TIER_SNAP.manaCost[t];
  }
  const thr = d.highDamageThreshold;
  return {
    enabled: bool(d.enabled, DEFAULT_TIER_SNAP.enabled),
    snapCooldown: bool(d.snapCooldown, DEFAULT_TIER_SNAP.snapCooldown),
    snapManaCost: bool(d.snapManaCost, DEFAULT_TIER_SNAP.snapManaCost),
    outOfRange: (OUT_OF_RANGE_MODES as readonly string[]).includes(d.outOfRange as string)
      ? (d.outOfRange as OutOfRangeMode)
      : DEFAULT_TIER_SNAP.outOfRange,
    highDamageThreshold:
      typeof thr === "number" && Number.isFinite(thr) && thr >= DAMAGE_THRESHOLD_MIN
        ? thr
        : DEFAULT_TIER_SNAP.highDamageThreshold,
    manaCost: Object.freeze(manaCost),
  };
}

/** 十五個格點的一句話（後台說明 · Codex 契約 · 報告**共用**，⛔ 不各自寫一段）。 */
export function describeTierSnap(
  snap: TierSnap = DEFAULT_TIER_SNAP,
  tiers: CooldownTiers = DEFAULT_COOLDOWN_TIERS,
): string {
  const shapes = COOLDOWN_SHAPES.map(
    (s) => `${s} ${SKILL_TIER_NAMES.map((t) => tiers.seconds[s][t]).join("/")}`,
  ).join(" · ");
  return (
    `不在格點上的冷卻與耗魔靠到格點上：**傷害低往前（短）靠、傷害高往後（長）靠**` +
    `（owner 2026-08-20）。冷卻格點 ${shapes}；耗魔格點 ` +
    `${SKILL_TIER_NAMES.map((t) => snap.manaCost[t]).join("/")}` +
    `（＝魔力池 ÷ ${MANA_CAST_ANCHORS.map((a) => a.casts).join(" / ")} 那兩個 owner 錨長出來的）。` +
    `超出上下限的沒有方向可挑 ⇒ 由 outOfRange 決定夾不夾。`
  );
}

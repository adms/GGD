/**
 * 級距**靠攏方向**（`config.tier-snap@1`）—— 把一個自由數字收進五格時**往哪一邊**收。
 *
 * owner 2026-08-21（逐字）：
 * > 「**傷害低的往前靠（短）、傷害高的往後靠（長）**」
 *
 * ⛔ 也就是**不是**四捨五入到最近的格點。`skillTiers.snapToTier` 的出貨預設
 * （`nearest`）在這條規則下是**錯的方向**：它讓一支傷害 200 的技能拿到跟一支
 * 傷害 2,600 的技能一樣的成本格，只因為它們的原始秒數剛好靠得近。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⏸ owner **沒有給**「高／低」的界線 ⇒ ⭐ 它是一格後台欄位，⛔ 不是我挑的一個數字
 *
 * 第一守則：「拿不定主意的決策，解法是兩種模式都做、後台可切」，而且
 * 「⚠️『拿去問 owner』也是一種『挑一個』—— 先問這能不能是一個欄位」。
 * ⇒ {@link TierSnap.threshold} 有兩種模式：
 *
 *   · `corpusMedian`（**出貨預設**）—— 界線 = **這一輪量到的**全庫傷害中位數。
 *     ⛔ 它刻意**不是**一個存在 JSON 裡的數字：內容改了，界線自己跟著動。
 *   · `fixed` —— owner 想釘一個數字時填 `threshold`。
 *
 * ⚠️ 「量到的中位數」要由呼叫端算完餵進來（{@link SnapContext.corpusMedianDamage}）——
 * 這個檔案 ⛔ 不碰 fs（同 `newHeroDefaults.ts`），語料住在產生器那一側。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 五條軸**各自**一格下拉，⛔ 不是一個全域開關
 *
 * owner 的規則字面上講的是「短／長」（成本軸）。⚠️ 而同一句話套到**幾何軸**
 * （施法距離／範圍）上是**反向**的：把高傷害技能的距離往上收 = 讓強的更強。
 * ⛔ 我沒有替 owner 決定哪幾條軸適用 —— 五條軸各是一格 enum，出貨值全部照他
 * 那句話的字面（`byDamage`），要退回中性只要把某一軸改成 `nearest`。
 *
 * ⚠️ 這是**創作期**（authoring-time）的規則：它決定產生器把哪一個級距**寫進**
 * 技能 JSON，⛔ 不是上線之後每一場比賽都在跑的邏輯。改了它要重跑
 * `pnpm tiernorm:build` 才會反映到內容上 —— 這一點與 `config.authoring-rules@1`
 * 同一個形態，⛔ 與 `config.cooldown-tiers@1` 那種**執行期**查表不同。
 */
import { SKILL_TIER_NAMES, snapToTier, type SkillTierName, type SnapPolicy } from "./skillTiers";

/** `content/config/tier-snap.json` 的文件 id。 */
export const TIER_SNAP_DOC_ID = "tier-snap";

/**
 * 五條會被收進級距的軸。⭐ 這是唯一一份清單 —— Zod、後台欄位、產生器、
 * 產生的契約文件全部從它推導（第零守則⑨：N 個同型 = 一張表）。
 */
export const TIER_SNAP_AXES = ["cooldown", "manaCost", "damage", "range", "radius"] as const;
export type TierSnapAxis = (typeof TIER_SNAP_AXES)[number];

/** 後台下拉的中文標籤。⛔ 不要在別處再寫一次。 */
export const TIER_SNAP_AXIS_ZH: Readonly<Record<TierSnapAxis, string>> = Object.freeze({
  cooldown: "冷卻",
  manaCost: "耗魔",
  damage: "傷害",
  range: "施法距離",
  radius: "施法範圍",
});

/**
 * 一條軸的靠攏方向。前三個轉發給 `skillTiers.snapToTier`；
 * `byDamage` 是 owner 那條規則本身 —— **這支技能的傷害**決定方向。
 */
export const TIER_SNAP_POLICIES = ["byDamage", "nearest", "down", "up"] as const;
export type TierSnapPolicy = (typeof TIER_SNAP_POLICIES)[number];

/** 界線怎麼決定。⛔ `corpusMedian` 是量出來的，⛔ 不是存下來的。 */
export const TIER_SNAP_THRESHOLD_MODES = ["corpusMedian", "fixed"] as const;
export type TierSnapThresholdMode = (typeof TIER_SNAP_THRESHOLD_MODES)[number];

export interface TierSnap {
  /** 止血閥。false = 五條軸一律 `nearest`（＝這條規則不存在時的行為）。 */
  enabled: boolean;
  /** 界線的來源。 */
  thresholdMode: TierSnapThresholdMode;
  /** `fixed` 時的界線（卡面基礎傷害）。`corpusMedian` 時**不讀**這一格。 */
  threshold: number;
  /**
   * 一支技能的傷害**量不到**時走哪一個方向（模板技、純被動、只有 `ratios`
   * 的技能）。⭐ 出貨 `nearest`：⛔ 量不到 ≠ 傷害低，把它們一律往下收會
   * 靜默地把 95 支模板技全部塞進最便宜的那一格。
   */
  unknownPolicy: TierSnapPolicy;
  /** 五條軸各自的方向。 */
  axes: Readonly<Record<TierSnapAxis, TierSnapPolicy>>;
}

/**
 * 出貨值 —— ⭐ 五條軸全部照 owner 那句話的字面（`byDamage`）。
 * 三個住處：`content/config/tier-snap.json` · 這裡 · `apps/admin` 的 `SHIPPED_*`。
 */
export const DEFAULT_TIER_SNAP: TierSnap = Object.freeze({
  enabled: true,
  thresholdMode: "corpusMedian" as TierSnapThresholdMode,
  // ⚠️ `corpusMedian` 模式**不讀**這一格；它在這裡是 `fixed` 的起點，
  //    ⛔ 不是「出貨界線是 0」。0 ＝「還沒有人釘過」。
  threshold: 0,
  unknownPolicy: "nearest" as TierSnapPolicy,
  axes: Object.freeze(
    Object.fromEntries(TIER_SNAP_AXES.map((a) => [a, "byDamage"])) as Record<
      TierSnapAxis,
      TierSnapPolicy
    >,
  ),
});

/** 這一輪的量測 —— 由產生器餵進來，⛔ 不存進 JSON。 */
export interface SnapContext {
  /** 全庫傷害中位數（卡面基礎），`corpusMedian` 模式的界線。 */
  readonly corpusMedianDamage: number;
}

/** 這一支技能的傷害（卡面基礎）。⛔ `undefined` ＝ 量不到，不是 0。 */
export type AbilityDamage = number | undefined;

/** 生效的界線 —— 兩種模式的唯一入口。 */
export function snapThreshold(snap: TierSnap, ctx: SnapContext): number {
  return snap.thresholdMode === "fixed" ? snap.threshold : ctx.corpusMedianDamage;
}

/**
 * 一條軸在這一支技能上**實際**用的方向。
 *
 * ⭐ owner 的規則就是這三行：量不到 → `unknownPolicy`；
 * 低於界線 → 往前靠（`down`）；否則往後靠（`up`）。
 */
export function effectivePolicy(
  snap: TierSnap,
  axis: TierSnapAxis,
  damage: AbilityDamage,
  ctx: SnapContext,
): SnapPolicy {
  if (!snap.enabled) return "nearest";
  const p = snap.axes[axis] ?? "nearest";
  if (p !== "byDamage") return p;
  if (damage === undefined) {
    const u = snap.unknownPolicy;
    return u === "byDamage" ? "nearest" : u;
  }
  return damage < snapThreshold(snap, ctx) ? "down" : "up";
}

/**
 * 把一個自由數字收進級距 —— **全專案唯一**知道「往哪一邊收」的地方。
 *
 * ⚠️ 出界的值由 `snapToTier` 夾在兩端（`up` 超過極大 → 極大，`down` 低於極小 →
 * 極小）。那**不是**靜默截斷：`tiernorm` 產生器會把被夾住的那幾支單獨列出來
 * 拿給 owner（24 支冷卻超過上限就是這樣被抓出來的）。
 */
export function snapAxis(
  value: number,
  table: Readonly<Record<SkillTierName, number>>,
  snap: TierSnap,
  axis: TierSnapAxis,
  damage: AbilityDamage,
  ctx: SnapContext,
): SkillTierName {
  return snapToTier(value, table, effectivePolicy(snap, axis, damage, ctx));
}

/** 一個值有沒有落在級距表的兩端之外（＝靠攏一定會改變它，而且改很多）。 */
export function outOfBand(
  value: number,
  table: Readonly<Record<SkillTierName, number>>,
): "under" | "over" | null {
  const lo = table[SKILL_TIER_NAMES[0]!];
  const hi = table[SKILL_TIER_NAMES[SKILL_TIER_NAMES.length - 1]!];
  if (value < lo) return "under";
  if (value > hi) return "over";
  return null;
}

function clampNum(v: unknown, fallback: number, min: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.max(v, min);
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** 把一份 `config.tier-snap@1` 文件正規化。認不得 → 出貨值。 */
export function tierSnapFromDoc(doc: unknown): TierSnap {
  const d = doc as
    | {
        schema?: string;
        enabled?: unknown;
        thresholdMode?: unknown;
        threshold?: unknown;
        unknownPolicy?: unknown;
        axes?: Record<string, unknown>;
      }
    | undefined;
  if (!d || d.schema !== "config.tier-snap@1") return DEFAULT_TIER_SNAP;
  const src = d.axes ?? {};
  const axes = {} as Record<TierSnapAxis, TierSnapPolicy>;
  for (const a of TIER_SNAP_AXES) {
    axes[a] = pick(src[a], TIER_SNAP_POLICIES, DEFAULT_TIER_SNAP.axes[a]);
  }
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_TIER_SNAP.enabled,
    thresholdMode: pick(
      d.thresholdMode,
      TIER_SNAP_THRESHOLD_MODES,
      DEFAULT_TIER_SNAP.thresholdMode,
    ),
    threshold: clampNum(d.threshold, DEFAULT_TIER_SNAP.threshold, 0),
    unknownPolicy: pick(d.unknownPolicy, TIER_SNAP_POLICIES, DEFAULT_TIER_SNAP.unknownPolicy),
    axes: Object.freeze(axes),
  };
}

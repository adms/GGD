/**
 * 冷卻**五級距**（`config.cooldown-tiers@1`，GH#445）—— 四軸裡的第四軸。
 *
 * owner 2026-08-19（逐字，這是第 1 層規格，⛔ 不是我推導出來的）：
 * > 「冷卻的階段只會分幾種 一樣是**極小小中大極大**
 * >  **單體 6/15/30/45/60**
 * >  **範圍 30/45/60/90/120**
 * >  **變身或持續增益狀態 30/45/60/90/120**
 * >  **不計入系統倍率及減少 CD 等效果**」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 這三張表是**卡面秒**，⛔ 不是玩家等到的秒
 *
 * owner 明說「不計入系統倍率及減少 CD 等效果」。實際等待 =
 * 這裡的值 × `combatEnv.cooldown`（出貨 **0.2**）× 暴走倍率，再被
 * `config.cooldown-rules@1` 的 `minSeconds` 夾一次。
 * ⇒ 單體·極小 **6 卡面秒 = 1.2 實際秒**。#446 與 #447 的反算全部站在這個換算上。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 為什麼三張表**照抄** owner 的數字，⛔ 沒有像 `skillTiers.ts` 那樣推導
 *
 * 幾何三軸（AoE / 施法距離 / 位移）的梯子是**推導**的，因為 owner 只給了兩個錨
 * （「大 = 1/4 競技場」「極大 = 1/3」），其餘要有一條規則才產得出來。
 * 冷卻**三張表十五格 owner 全部給滿了** —— 照第〇·六守則第 1 層，
 * 這裡再套一條「更漂亮的」數列就是拿第 2 層去蓋第 1 層。
 *
 * ⚠️ 而且那條數列真的存在，只是它**解釋不了 6**：頂端六格
 * `15 × {1,2,3,4,6,8}` = 15/30/45/60/90/120 是一個乾淨的整除格點，而 6 不在上面。
 * owner 2026-08-19 對此的裁決是：
 * > 「**極大跟極小都是屬於卡上下限的例外而非線性規則**」
 * ⇒ 6 是**下限**，它本來就不必落在線性段的格點上。線性段（小/中/大）的
 * 範圍÷單體 = 3.0 / 2.0 / 2.0，全部落在 owner 給的「2–5× 上下限參考準則」內。
 * ⛔ 不要「修正」它 —— 那正是我 2026-08-19 提過又被 owner 推翻的建議。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 形狀（`cooldownShape`）決定查哪一張表，而它**預設是推導的**
 *
 * 一支技能只填 `cooldownTier: "中"` 是不夠的 —— 「中」在單體是 30 秒、在範圍是
 * 60 秒。⇒ 需要第二格：`cooldownShape`。
 *
 * ⚠️ 但要求每一支都手填第二格，代價是**忘了填的那些會靜默拿到單體（便宜）那張表**
 * —— 一個範圍大絕只等 30 秒而不是 60 秒，而卡片、schema、測試全部正常
 *（失敗形態②）。所以 `autoShape` 出貨 **on**：沒填就從技能自己的內容推
 *（有 `championForm` → 變身；有 `radius`/`radiusTier` → 範圍；其餘 → 單體）。
 * 手填的 `cooldownShape` 永遠贏 —— 推導只補「沒有人說」的那些。
 *
 * ⚠️ 級距是**一支技能一格**，⛔ 不是逐等級各一格（同 `tools/skill-tiers/gen_tiers.ts`
 * 的既有立場）。所以解析時整條 `cooldown` 陣列的每一階都被寫成同一個值 ——
 * 想要「升階冷卻下降」的技能就**不要填** `cooldownTier`，手寫陣列一直都合法。
 */
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

/** `content/config/cooldown-tiers.json` 的文件 id。 */
export const COOLDOWN_TIERS_DOC_ID = "cooldown-tiers";

/** 五個級別 —— 與 AoE／施法距離／位移**同一份**。⛔ 不要在這裡另立一組。 */
export const COOLDOWN_TIER_NAMES = SKILL_TIER_NAMES;
export type CooldownTierName = SkillTierName;

/**
 * 三張表各自服務的技能形狀。⭐ 這三個字是 **owner 給的**（「單體」「範圍」
 * 「變身或持續增益狀態」），⛔ 不是我分的類。
 */
export const COOLDOWN_SHAPES = ["單體", "範圍", "變身"] as const;
export type CooldownShape = (typeof COOLDOWN_SHAPES)[number];

export interface CooldownTiers {
  /**
   * 止血閥。false = `cooldownTier` 不解析（填了也不生效，但**看得見它是關的**）。
   * ⚠️ 關掉**不會**讓技能失去冷卻 —— 手寫的 `cooldown` 陣列一直都在。
   */
  enabled: boolean;
  /**
   * 沒填 `cooldownShape` 時要不要從技能內容推形狀。
   * 關掉 = 沒填的一律當「單體」，⚠️ 那會讓範圍技靜默拿到便宜的那張表。
   */
  autoShape: boolean;
  /** 形狀 → 級別 → **卡面**秒數。⛔ 不是玩家等到的秒（見檔頭）。 */
  seconds: Readonly<Record<CooldownShape, Readonly<Record<CooldownTierName, number>>>>;
}

/** owner 2026-08-19 給的三張表，逐字。 */
const OWNER_TABLES: Record<CooldownShape, readonly number[]> = {
  單體: [6, 15, 30, 45, 60],
  範圍: [30, 45, 60, 90, 120],
  變身: [30, 45, 60, 90, 120],
};

function tableOf(shape: CooldownShape): Readonly<Record<CooldownTierName, number>> {
  const out = {} as Record<CooldownTierName, number>;
  COOLDOWN_TIER_NAMES.forEach((n, i) => {
    out[n] = OWNER_TABLES[shape][i]!;
  });
  return Object.freeze(out);
}

/**
 * 出貨值。三個住處：`content/config/cooldown-tiers.json` · 這裡 ·
 * `apps/admin` 的 `SHIPPED_*`。
 */
export const DEFAULT_COOLDOWN_TIERS: CooldownTiers = Object.freeze({
  enabled: true,
  autoShape: true,
  seconds: Object.freeze({
    單體: tableOf("單體"),
    範圍: tableOf("範圍"),
    變身: tableOf("變身"),
  }),
});

/**
 * 單一格的上下界。
 * 下界 **1 秒**：卡面 1 秒 × `combatEnv.cooldown` 0.2 = 0.2 實際秒，已經在
 * `cooldown-rules.minSeconds`（0.1）的兩倍上 —— 比它更短的「冷卻」等於沒有冷卻。
 * 上界 **600 秒**：與 `config.authoring-rules@1` 的 `zCooldownBand` 同一個數字，
 * 而一場實打只有 5–6 回合 × 每回合 ~112 秒，600 卡面秒（120 實際秒）已經是
 * 「一回合放一次」的邊界。
 */
export const COOLDOWN_TIER_MIN = 1;
export const COOLDOWN_TIER_MAX = 600;

function clampSec(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, COOLDOWN_TIER_MIN), COOLDOWN_TIER_MAX);
}

/** 把一份 `config.cooldown-tiers@1` 文件正規化成三張表。認不得 → 出貨值。 */
export function cooldownTiersFromDoc(doc: unknown): CooldownTiers {
  const d = doc as
    | { schema?: string; enabled?: unknown; autoShape?: unknown; seconds?: Record<string, unknown> }
    | undefined;
  if (!d || d.schema !== "config.cooldown-tiers@1") return DEFAULT_COOLDOWN_TIERS;
  const src = d.seconds ?? {};
  const seconds = {} as Record<CooldownShape, Readonly<Record<CooldownTierName, number>>>;
  for (const shape of COOLDOWN_SHAPES) {
    const row = (src[shape] ?? {}) as Record<string, unknown>;
    const out = {} as Record<CooldownTierName, number>;
    for (const name of COOLDOWN_TIER_NAMES) {
      out[name] = clampSec(row[name], DEFAULT_COOLDOWN_TIERS.seconds[shape][name]);
    }
    seconds[shape] = Object.freeze(out);
  }
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_COOLDOWN_TIERS.enabled,
    autoShape: typeof d.autoShape === "boolean" ? d.autoShape : DEFAULT_COOLDOWN_TIERS.autoShape,
    seconds: Object.freeze(seconds),
  };
}

/**
 * 這棵子樹裡有沒有「一個叫這些名字的鍵」或「一個 `kind` 是這些名字的效果」。
 *
 * ⚠️ **兩種都要看**是踩出來的：`radiusTier` / `radius` 是**鍵**，而變身是
 * `{ kind: "championForm", … }` —— 一個**值**。只掃鍵名的話變身技會被判成單體，
 * 拿到便宜一半的那張表，⛔ 而且沒有任何東西會紅。
 */
function mentions(node: unknown, names: readonly string[]): boolean {
  if (Array.isArray(node)) return node.some((n) => mentions(n, names));
  if (node === null || typeof node !== "object") return false;
  const rec = node as Record<string, unknown>;
  const kind = rec["kind"];
  for (const k of names) {
    if (rec[k] !== undefined) return true;
    if (kind === k) return true;
  }
  for (const v of Object.values(rec)) if (mentions(v, names)) return true;
  return false;
}

/**
 * 一支技能該查哪一張表。
 *
 * 順序（每一步都是決策點，寫在這裡而不是散在呼叫端）：
 *   1. 手填的 `cooldownShape` —— 永遠贏。
 *   2. `autoShape` 開著 → 從內容推：`championForm` → 變身；`radius`/`radiusTier`
 *      → 範圍；其餘 → 單體。⚠️ 變身在範圍前面：一支帶 AoE 的變身技仍然是變身。
 *   3. 都不成立 → 單體。
 */
export function cooldownShapeOf(def: Record<string, unknown>, tiers: CooldownTiers): CooldownShape {
  const explicit = def["cooldownShape"];
  if (typeof explicit === "string" && (COOLDOWN_SHAPES as readonly string[]).includes(explicit)) {
    return explicit as CooldownShape;
  }
  if (!tiers.autoShape) return "單體";
  if (mentions(def, ["championForm"])) return "變身";
  if (mentions(def, ["radius", "radiusTier"])) return "範圍";
  return "單體";
}

/**
 * 把一支技能（或一件道具）上的 `cooldownTier` 翻成 `cooldown`。
 *
 * ⭐ 全專案**唯一**知道級別怎麼變成秒數的地方（同 `resolveRangeTier`）——
 * 註冊表、編輯器預覽、後台試算都呼叫它。
 *
 * 規則：
 *   · 沒有 `cooldownTier` → 原樣返回。手寫 `cooldown` 是完全合法的寫法。
 *   · `enabled: false` → 原樣返回（＝一鍵回到舊的那一套數字）。
 *   · 沒有 `cooldown` 陣列可以蓋 → 原樣返回。⛔ 不憑空長出一格冷卻。
 *   · **`cooldown` 與 `cooldownTier` 同時存在 → 級別贏**，而且**每一階都寫同一個值**
 *     （級距是一支技能一格）。想要逐階不同的，⛔ 就不要填級別。
 *
 * ⚠️ 只看**頂層** —— `cooldown` 在 `ability@1` 與 `item@1` 都是頂層欄位，
 * 而深走訪會讓一個內嵌在 effect 裡的 `cooldown`（例如 `modifyCooldown`）
 * 被誤當成技能本身的冷卻。
 */
export function resolveCooldownTier<T extends Record<string, unknown>>(
  def: T,
  tiers: CooldownTiers,
): T {
  if (!tiers.enabled) return def;
  const tier = def["cooldownTier"];
  if (typeof tier !== "string") return def;
  const cd = def["cooldown"];
  if (!Array.isArray(cd) || cd.length === 0) return def;
  const secs = tiers.seconds[cooldownShapeOf(def, tiers)][tier as CooldownTierName];
  if (typeof secs !== "number") return def;
  return { ...def, cooldown: cd.map(() => secs) };
}

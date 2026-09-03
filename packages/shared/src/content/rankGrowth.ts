/**
 * ⭐⭐ **升級成長率的解析**（GH#938）—— 從**冷卻級距**推導。
 *
 * owner 2026-09-02（逐字）：
 * > 「`rankGrowth` 全域預設 0.5 其實**跟 CD／觸發頻率有關係**，
 * >  陽離子砲會是 `rankGrowth: 1.0` 是因為 **CD 較長**」
 *
 * ⛔⛔ **它要解決的是一個量到的謊**：`content/abilities` 全掃 ——
 * **29 個 `damageTierPerRank` 節點，27 個（93%）至少有一級升了零提升**。
 * 根因是傷害梯子只有五格而技能有 3–4 級 ⇒ 一條「每級 +100」的卡面
 * 被**量化**到那五格（120→200、220→200、320→500、420→500）
 * ⇒ ⭐ 卡面說「每級 +100」而遊戲裡是「**+0 / +300 / +0**」。
 *
 * ⭐ 解析在**載入時**（第〇·四守則）：技能只寫 `damageTier` ＋ 它的
 * `cooldownTier`，成長率由這一支查表 —— ⛔ 而不是把 3–4 個算好的值
 * 烘進每一份文件（那是 N × 每次公式改動的成本）。
 *
 * ⚠️ ⭐ **它與 `damageTierPerRank` 今天並存**：這一支是**新的表達方式**，
 * ⛔ 而既有那 29 個節點還沒遷移 —— 遷移是內容側的事，
 * 而棘輪（`rankGrowthHonesty.test.ts`）讓「有幾個節點還在說謊」變成一個會紅的數字。
 */
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

/** ⛔ 缺文件時的出貨值 —— 與 `content/config/rank-growth.json` 逐格相同。 */
export const DEFAULT_RANK_GROWTH: Readonly<Record<SkillTierName, number>> = Object.freeze({
  極小: 0.5,
  小: 0.5,
  中: 0.5,
  大: 0.75,
  極大: 1.0,
});

/** ⚠️ 技能沒有 `cooldownTier` 時 —— ⭐ 0.5 是量到的中位數。 */
export const RANK_GROWTH_WHEN_TIER_ABSENT = 0.5;

/**
 * ⭐ 這一支是**純函式**（同 `resolveCastTimeTier` 那一族）——
 * ⛔ 它不去查 registry：那會讓 `packages/shared/src/content` 依賴 sim 的載入順序，
 * 而同一個環在這個 repo 已經炸過三次（`zRef` / `zCastableSlot` / `PULSE_MS`）。
 * ⇒ ⭐ 表由呼叫端傳，預設是出貨值。
 */
export interface RankGrowthRules {
  enabled: boolean;
  byCooldownTier: Readonly<Record<SkillTierName, number>>;
  whenTierAbsent: number;
}

export const DEFAULT_RANK_GROWTH_RULES: RankGrowthRules = Object.freeze({
  enabled: true,
  byCooldownTier: DEFAULT_RANK_GROWTH,
  whenTierAbsent: RANK_GROWTH_WHEN_TIER_ABSENT,
});

/**
 * ⭐ 這一支技能每升一級成長幾成。
 *
 * ⚠️ ⭐ 回 `null` 代表「這一格沒有意見」（總開關關掉）——
 * ⛔ 不是 0：0 的意思是「升級完全不變強」，而那是**另一件事**
 * （同 `resolveCastTimeTier` 那一族的規矩）。
 */
export function resolveRankGrowth(
  cooldownTier: unknown,
  rules: RankGrowthRules = DEFAULT_RANK_GROWTH_RULES,
): number | null {
  if (!rules.enabled) return null;
  if (typeof cooldownTier === "string" && (SKILL_TIER_NAMES as readonly string[]).includes(cooldownTier)) {
    const v = rules.byCooldownTier[cooldownTier as SkillTierName];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return rules.whenTierAbsent;
}

/**
 * ⭐ 把一個首級值展開成逐級的梯子。
 *
 * ⚠️ ⭐ **線性**（`base × (1 + growth × i)`），⛔ 不是幾何 ——
 * 那是量到的形狀：owner 點名的 80-02 弒鬼神卡面逐字是
 * 「120/220/320/420（**每級 +100**）」，⭐ 而 +100 對 120 是等差、⛔ 不是等比。
 */
export function expandRankLadder(base: number, growth: number, ranks: number): number[] {
  const n = Math.max(1, Math.floor(ranks));
  return Array.from({ length: n }, (_, i) => base * (1 + growth * i));
}

/**
 * ⭐⭐ **把「只有一格 `damageTier`」的多階技能展開成階梯**（GH#906）。
 *
 * ⛔⛔ 量到的現況（2026-09-03）：`content/abilities` 裡
 * **153 份 `maxRank > 1` 的技能只有單一 `damageTier`** ⇒ ⭐ 升級**完全不加傷害**。
 * ⚠️ 而卡面多半寫著「120/220/320/420」這種階梯 ⇒ ⭐ 那是第一·五守則的空宣稱。
 *
 * ⭐⭐ **而 GH#906 票文開的藥是錯的**：它說「從 git 找出每一支被 `tierize` 取代掉的
 * 原始 `perRank`，逐支寫回」——⛔ 那是 **O(N) 的考古**，而且
 * ⭐ 它把一份**算得出來的**資料烘回 153 份文件（⛔ 正是第〇·四守則禁止的形狀）。
 *
 * ⇒ ⭐ 正解是**在載入時展開**：技能只寫 `damageTier` ＋ 它的 `cooldownTier`，
 * 成長率由 `resolveRankGrowth()` 查表 ⇒ ⭐ 一次接線解決全部，
 * 而 owner 哪天改那五格，**零份文件要重寫**。
 *
 * ⚠️ ⭐ **寫的是 `perRank` 的「增量」，⛔ 不是絕對值** ——
 * `resolveScaling` 算的是 `flat + perRank[rank-1]`（⭐ 相加），
 * 所以第 1 階必須是 **0**，第 i 階是 `flat × growth × i`
 * ⇒ 合起來 `flat × (1 + growth × i)` ＝ `expandRankLadder` 的定義。
 * ⛔ 寫絕對值會讓第 1 階當場變成兩倍。
 *
 * ⚠️ ⭐ **已經有逐階資料的一律不碰**（`perRank` 或 `damageTierPerRank` 在的話）——
 * 那是作者/產生器**明確寫下**的曲線，⛔ 它贏過這條推導（第〇·六守則的階梯）。
 */
export function resolveRankGrowthOnDoc<T>(doc: T, rules: RankGrowthRules = DEFAULT_RANK_GROWTH_RULES): T {
  if (!rules.enabled) return doc;
  const d = doc as unknown as Record<string, unknown>;
  const maxRank = typeof d["maxRank"] === "number" ? d["maxRank"] : 1;
  if (!(maxRank > 1)) return doc;
  const growth = resolveRankGrowth(d["cooldownTier"], rules);
  if (growth === null || !(growth > 0)) return doc;

  let touched = false;
  const walk = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(walk);
    if (!o || typeof o !== "object") return o;
    const n = { ...(o as Record<string, unknown>) };
    // ⭐ 一個 `amount` 節點：有 `flat`、⛔ 而沒有任何逐階資料。
    const isAmount =
      typeof n["flat"] === "number" &&
      n["perRank"] === undefined &&
      n["damageTierPerRank"] === undefined;
    if (isAmount) {
      const base = n["flat"] as number;
      if (base > 0) {
        // ⭐ 增量：第 1 階 0，第 i 階 base × growth × i。
        n["perRank"] = Array.from({ length: maxRank }, (_, i) => base * growth * i);
        touched = true;
      }
    }
    for (const [k, v] of Object.entries(n)) n[k] = walk(v);
    return n;
  };
  const out = walk(d) as T;
  return touched ? out : doc;
}

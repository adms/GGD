/**
 * 🧮 **出身表試算**（GH#1260 B2）—— 「出身表那一套算出來的值」與「套上現在的屬性係數之後」並排，**只顯示**。
 *
 * owner（逐字）：
 *   · 2026-08-21「我們計算的時候都不考慮任何系統倍率」（`docs/_daily/2026-08-21.md:71`）
 *   · 2026-08-22「但是系統倍率不能放在裡面」（`docs/_daily/2026-08-22.md:23`）
 *   · 2026-09-15（C5，同一個形狀）「頂多是後台試算後顯示 但不干涉也不警示」（`docs/_daily/2026-09-15.md:13`）
 *
 * ⇒ 主 session 2026-09-15 的決定（Claude 的判斷，⛔ 不是 owner 原話）：出身表的反解**不改**，
 *   出貨的 `agiToArmor`／`strToAttackDamage` 當 owner 旋鈕。兩個數字的差只在這裡看得到 ——
 *   ⛔ 不評判、⛔ 不上色、⛔ 不進任何閘。例：射手克勞斯 LV99 護甲，出身表 45.05、套現行係數 49.40。
 *
 * ⭐ 這個檔一條公式都沒有（第〇·四守則）：
 *   · 反解後的英雄卡 ＝ `resolveChampionRuntimeStats()`（註冊表真的在跑的那一支）
 *   · 「出身表」那一欄 ＝ 反解時用的 `STAT_RESOLVE_DEPS.statAt()`，在 `referenceLevel`
 *   · 「套現行係數」那一欄 ＝ 同一張反解後的卡，`championStatBase(…, normalizeCombatEnv(env))`
 * ⚠️ 兩欄都停在 `championStatBase`：⛔ 沒含系統倍率（defense／attackDamage）、基礎加成、每級加成、道具、buff。
 */
import { STAT_RESOLVE_DEPS, resolveChampionRuntimeStats } from "@ggd/shared/content/championRuntimeResolver";
import {
  NORMALIZED_STAT_TO_STAT,
  championRoster,
  statNormalizationFromDoc,
  type NormalizedStatKey,
} from "@ggd/shared/content/statNormalization";
import { championStatBase } from "@ggd/shared/sim/stats/attributes";
import { normalizeCombatEnv, type CombatEnvKey } from "@ggd/shared/sim/combatEnv";

/** 只列這兩項：出貨係數與程式預設**真的不同**、而且在出身表 11 項裡的，就是這兩項（`combat-env.json` 對 `combatEnv.ts` 預設）。 */
export const TRIAL_STATS = ["armor", "ad"] as const satisfies readonly NormalizedStatKey[];
export type TrialStat = (typeof TRIAL_STATS)[number];

export interface OriginTrialCell {
  /** 出身表那一套（反解用的係數）算回 `referenceLevel` 的值 —— 通常就是表上那一格；成長被夾到 0 時會比表大。 */
  readonly table: number;
  /** 同一張反解後的卡，套現在生效的屬性係數，逐等級。 */
  readonly live: Readonly<Record<number, number>>;
}

export interface OriginTrialRow {
  readonly id: string;
  readonly name: string;
  readonly origin: string | null;
  readonly cells: Readonly<Record<TrialStat, OriginTrialCell>>;
}

export interface OriginTrial {
  readonly referenceLevel: number;
  /** LV30 與出身表的參考等級（出貨 99）。 */
  readonly levels: readonly number[];
  readonly rows: readonly OriginTrialRow[];
}

export function originTrial(
  champions: readonly Record<string, unknown>[],
  normalizationDoc: unknown,
  env: Partial<Record<CombatEnvKey, number>>,
): OriginTrial {
  const ref = statNormalizationFromDoc(normalizationDoc).referenceLevel;
  const levels = [...new Set([30, ref])].sort((a, b) => a - b);
  const configs = normalizationDoc && typeof normalizationDoc === "object" ? [normalizationDoc as { schema?: string }] : [];
  const roster = championRoster(champions);
  const liveEnv = normalizeCombatEnv(env);
  const rows = champions
    // 變身態不列：出身表預設跳過它們（`skipTransformedBodies`），它們的數字不是這張表決定的。
    .filter((d) => (d["transform"] as { role?: unknown } | undefined)?.role !== "alternate")
    .map((d): OriginTrialRow => {
      const card = resolveChampionRuntimeStats(d, configs, roster) as Record<string, unknown>;
      const def = { ...card, baseStats: card["baseStats"] ?? {}, growth: card["growth"] ?? {} } as never;
      const cell = (k: TrialStat): OriginTrialCell => ({
        table: STAT_RESOLVE_DEPS.statAt(card, k, ref),
        live: Object.fromEntries(levels.map((lv) => [lv, championStatBase(def, NORMALIZED_STAT_TO_STAT[k], lv, liveEnv)])),
      });
      return {
        id: String(d["id"]),
        name: String(d["name"] ?? d["id"]),
        origin: typeof card["origin"] === "string" ? (card["origin"] as string) : null,
        cells: { armor: cell("armor"), ad: cell("ad") },
      };
    });
  return { referenceLevel: ref, levels, rows };
}

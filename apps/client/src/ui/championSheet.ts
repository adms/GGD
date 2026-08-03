/**
 * The champion STAT SHEET as a player should read it — one definition shared by
 * champ-select's 屬性 tab and the codex's champion page.
 *
 * WHY THIS EXISTS (task #248). Until the 三圍 landed, "base" and "per-level
 * growth" were literally `def.baseStats[k]` and `def.growth[k]`, so both tables
 * just iterated the two records. That is now WRONG: `baseStats.maxHealth` holds
 * the source map's raw 150, and the champion's real level-1 health is
 * `150 + 25×STR = 575`. A table that printed 150 (and then, obeying #125,
 * multiplied it by the combat-env `maxHealth` factor to "戰鬥實際") would be
 * confidently wrong in both columns — the exact stale-reader failure #248 was
 * told to design against.
 *
 * So the rows are computed through the SIM's own seam,
 * `sim/stats/attributes.ts championStatBase/championStatGrowth`, the same one
 * `recomputeStats` uses. For a stat with no attribute source (mr, ms, range,
 * cdr…) the helpers reduce to exactly the old `base` / `growth` numbers, so
 * nothing else about the tables changes.
 */
import {
  championStatBase,
  championStatGrowth,
  ATTR_STAT_SOURCE,
  NO_ATTR_BONUS,
  type AttrBonus,
  type AttributeCarrier,
} from "@ggd/shared/sim/stats/attributes";
import { ALL_STATS, type Stat } from "@ggd/shared/sim/stats/statTypes";
import { DEFAULT_BASE_BONUS, finalizeStat, type BaseBonusTable } from "@ggd/shared/sim/baseBonus";
import { DEFAULT_STAT_CAPS, type StatCapTable } from "@ggd/shared/sim/statCaps";
import type { CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import {
  DEFAULT_BODY_SCALE_RULES,
  attackRangeScaleFactor,
  type BodyScaleRules,
} from "@ggd/shared/sim/bodyScale";

/** One row of the stat table: the level-1 value and the per-level increment. */
export interface ChampionSheetRow {
  /** stat-doc key ("maxHealth", "ad", "mr" …) */
  readonly key: string;
  /**
   * Base at the READ LEVEL, INCLUDING the 三圍 term (and anything bought this
   * match). Level 1 unless the caller passes a {@link ChampionSheetContext} —
   * that is the champ-select / codex 型錄 view. undefined = the card is silent.
   */
  readonly base: number | undefined;
  /** per-level increment INCLUDING attribute growth; undefined = none */
  readonly growth: number | undefined;
  /** true when an attribute contributes to this row (drives the 三圍 hint) */
  readonly fromAttribute: boolean;
  /**
   * 戰鬥實際 —— the value the player will really have at the READ LEVEL: env
   * multiplier, then 基礎加成, then the stat clamp, via the SIM's own
   * `finalizeStat`.
   *
   * ⚠️ 這一欄不能由呼叫端自己算成 `base × 倍率`。基礎加成是**加在倍率之後**的
   * (sim/baseBonus.ts),自己乘的面板會少掉那 300,而且畫面上完全看不出來 ——
   * 它只是一個「比較小的合理數字」。undefined = 這張卡對這一項沒有意見。
   */
  readonly final: number | undefined;
}

const EPS = 1e-9;
const STAT_BY_KEY = new Map<string, Stat>(ALL_STATS.map((s) => [s as string, s]));

/**
 * WHO the sheet is being read FOR (task: 右下角懸停屬性面板).
 *
 * ⚠️ 為什麼這是一個選項而不是硬寫 level 1。champ-select 與 codex 讀的是「這張卡
 * 一級長什麼樣」,那是一份**型錄**;戰鬥中右下角的懸停面板讀的是「**我現在**
 * 長什麼樣」。同一份表在兩個地方是同一個問題的兩個實例,而不是兩個問題 ——
 * 所以答案是給這個讀取器一個 `level` / `attrBonus`,不是在 HUD 再寫第二份
 * `championStatBase` 的呼叫(#248 的整個教訓就是「第二個讀取器會漂走」)。
 *
 * 兩個都缺 = level 1 + 沒有買過屬性 = **逐位元等於**這個選項出現之前的行為,
 * 所以既有的三個呼叫端一個字都不用改。
 */
export interface ChampionSheetContext {
  /** 英雄的當前等級(1 起)。缺 = 1,也就是型錄視角。 */
  readonly level?: number;
  /** 這一場**買到**的三圍(#260 的 `SeatState.attrBonus`)。缺 = 零。 */
  readonly attrBonus?: AttrBonus;
}

/**
 * Every stat the card has an opinion about, in the document's own key order
 * (baseStats first, then any growth-only key), each resolved through the sim.
 */
export function championSheetRows(
  def: AttributeCarrier,
  env?: CombatEnvMultipliers,
  baseBonus: BaseBonusTable = DEFAULT_BASE_BONUS,
  /**
   * 屬性上限表 (GH#286). 缺 = **出貨預設**,不是空表 —— 空表會讓 `capFor` 退回
   * `STAT_CLAMPS`,於是後台把攻速一般上限調到 5.0 之後,面板還是印 4.0 而伺服器
   * 給 5.0。這張卡本身沒有 buff,所以這裡永遠沒有 `capRaise`:面板顯示的是
   * 「這位英雄裸裝的天花板」。
   */
  caps: StatCapTable = DEFAULT_STAT_CAPS,
  /**
   * 身體放大倍數規則 (GH#252)。缺 = **出貨預設**,不是「關掉」—— 關掉會讓面板
   * 印卡面射程而伺服器給體型放大過的那一個(#125 的形狀)。
   */
  bodyScaleRules: BodyScaleRules = DEFAULT_BODY_SCALE_RULES,
  ctx: ChampionSheetContext = {},
): ChampionSheetRow[] {
  // 只有 `Stat.AttackRange` 讀得到它(`finalizeStat` 內部判斷),所以其他 15 條
  // 逐位元不變。`def.bodyScale` 缺 = 1.0。
  const rangeScale = attackRangeScaleFactor(
    (def as { bodyScale?: number }).bodyScale,
    bodyScaleRules,
  );
  const level = Math.max(1, ctx.level ?? 1);
  const attrBonus = ctx.attrBonus ?? NO_ATTR_BONUS;
  const base = def.baseStats as Readonly<Record<string, number | undefined>>;
  const growth = def.growth as Readonly<Record<string, number | undefined>>;
  const keys = [...new Set([...Object.keys(base), ...Object.keys(growth)])];
  return keys.map((key) => {
    const stat = STAT_BY_KEY.get(key);
    const src = stat === undefined ? undefined : ATTR_STAT_SOURCE[stat];
    // ⚠️ 「有沒有三圍來源」不只看 `def.attributes`。一位**沒有**三圍區塊的英雄
    // 仍然可以在這一場買到力/敏/智(#260 的 `championAttribute` 就是為此不再
    // early-out),所以買到的量不為零時這一列同樣是被三圍推導出來的。
    // 兩個都缺(型錄視角)時這個條件逐字等於原本的 `def.attributes !== undefined`。
    const derived =
      stat !== undefined &&
      src !== undefined &&
      (def.attributes !== undefined || attrBonus[src.attr] !== 0);
    if (stat === undefined || !derived) {
      // no attribute source (or a hand-edited unknown key) — the doc IS the truth
      const raw = base[key];
      // ⚠️ `raw === undefined` 要原封不動傳下去:那代表「這張卡對這一項沒有
      // 意見」(只寫了 growth 的那種 key),而 `championStatBase` 會很樂意把它
      // 答成 0 —— 一個看起來完全合理的假數字。
      const b =
        raw === undefined || stat === undefined
          ? raw
          : championStatBase(def, stat, level, env, attrBonus);
      return {
        key,
        base: b,
        growth: growth[key],
        fromAttribute: false,
        // A hand-edited unknown key has no Stat, so there is nothing to finalize
        // — the doc value IS the number, and inventing a multiplier for it would
        // be worse than showing none.
        final:
          stat === undefined || b === undefined
            ? undefined
            : finalizeStat(b, stat, { env, baseBonus, caps, rangeScale }),
      };
    }
    const g = championStatGrowth(def, stat, env);
    const b = championStatBase(def, stat, level, env, attrBonus);
    return {
      key,
      base: b,
      growth: Math.abs(g) < EPS ? undefined : g,
      fromAttribute: true,
      final: finalizeStat(b, stat, { env, baseBonus, caps, rangeScale }),
    };
  });
}

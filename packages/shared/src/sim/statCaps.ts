/**
 * 屬性上限 (stat caps) — 一般上限 vs **解鎖**上限 (GH#286).
 *
 * owner, 2026-07-28:「一般上限是 4.0,搭配特殊條件如技能、道具...等效果,
 * 可以解鎖最多到 10.0。這兩個參數也可以放到後台設定,也可以是技能模板的其中
 * 一項技能效果」.
 *
 * ---------------------------------------------------------------------------
 * 兩個數字,不是一個
 * ---------------------------------------------------------------------------
 * `base`      —— 沒有任何解鎖來源時,這條屬性被夾在哪裡。攻速 4.0。
 * `unlocked`  —— 解鎖來源**最多**能把它抬到哪裡。攻速 10.0,而且是**硬上限**:
 *                一個寫 `CapRaise 999` 的技能只能抬到 10.0。
 *
 * 解鎖的載體是 `ModOp.CapRaise`(sim/stats/modifiers.ts)。它的 `value` 是
 * 「把上限抬到多少」,**不是加成、不是倍率** —— 所以多個來源取 **max**,兩個
 * 5.0 / 7.0 的來源給的是 7.0 而不是 12.0。疊加語意會讓「三個小 buff 意外把
 * 天花板頂穿」變成常態,而 owner 要的是一個可以講清楚的天花板。
 *
 * 為什麼不需要新的 effect kind:`applyBuff` 早就帶著 `modifiers: StatModifier[]`
 * (content/schema/effect.ts),而 `zModOp = z.nativeEnum(ModOp)` 是整份 enum ——
 * 所以技能、道具、三選一、靈氣在 enum 多一個成員的那一刻**全部立刻能用**,
 * content schema 一行都不用改。這就是 owner 說的「也可以是技能模板的其中一項
 * 技能效果」。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 缺文件 = 出貨預設,不是空表
 * ---------------------------------------------------------------------------
 * `statCapsFromDoc` 對「沒有文件 / 壞文件」回傳 `DEFAULT_STAT_CAPS`。回空表的話
 * `capFor` 會退回 `STAT_CLAMPS` 的上界,於是 `unlocked === base`,**解鎖功能整個
 * 靜默消失**:技能照放、buff 照掛、面板照顯示,攻速就是永遠上不去 4.0。沒有任何
 * 錯誤訊息會提到這件事。這是這個檔案最容易犯的錯,所以它有自己的守衛。
 */
import { STAT_CLAMPS, Stat } from "./stats/statTypes";

/** 一條屬性的兩個天花板。`unlocked >= base` 由建構端保證。 */
export interface StatCap {
  /** 沒有解鎖來源時的上限 */
  base: number;
  /** 解鎖來源最多能抬到的上限(硬上限) */
  unlocked: number;
}

/** stat-keyed cap table. 缺鍵 = 沒有解鎖能力(見 `capFor`)。 */
export type StatCapTable = Readonly<Partial<Record<Stat, StatCap>>>;

/**
 * 出貨預設。只有攻速一條 —— owner 只點名了攻速,而替其他屬性憑空發明一個
 * `unlocked` 等於默默放寬它們的平衡,那不是這個任務要做的事。要新增就在後台
 * (或這裡)明確加一列。
 */
export const DEFAULT_STAT_CAPS: StatCapTable = Object.freeze({
  [Stat.AttackSpeed]: Object.freeze({ base: 4.0, unlocked: 10.0 }),
});

/** 這一頁/這張表管得到的屬性:有夾限的,或出貨預設有列的。 */
export const CAPPABLE_STATS: readonly Stat[] = Object.freeze(
  Array.from(
    new Set<Stat>([
      ...(Object.keys(STAT_CLAMPS) as Stat[]),
      ...(Object.keys(DEFAULT_STAT_CAPS) as Stat[]),
    ]),
  ),
);

/**
 * 讀一條屬性的天花板。
 *
 * 表裡沒有這條 → 退回 `STAT_CLAMPS` 的**上界**,而且 `base === unlocked`:
 * 一條沒有被 cap 表描述的屬性**不能被解鎖**,`CapRaise` 對它是 no-op。完全沒有
 * 夾限的屬性(生命上限、攻擊力…)兩個都是 +∞,也就是原本就沒有上限。
 */
export function capFor(table: StatCapTable | undefined, stat: Stat): StatCap {
  const c = table?.[stat];
  if (c && Number.isFinite(c.base) && Number.isFinite(c.unlocked)) {
    return { base: c.base, unlocked: Math.max(c.base, c.unlocked) };
  }
  const clamp = STAT_CLAMPS[stat];
  const hi = clamp ? clamp[1] : Number.POSITIVE_INFINITY;
  return { base: hi, unlocked: hi };
}

/**
 * 這個單位、這條屬性,**現在**的上限。
 *
 *     clamp( max(base, raised), base, unlocked )
 *
 * `raised` 是該單位身上所有 `CapRaise` 取 max 的結果(0 = 沒有任何解鎖來源)。
 * 比 `base` 小的解鎖是 no-op —— 解鎖只能往上,不能拿來偷偷**降低**別人的上限,
 * 那會變成一個沒有人預期的削弱管道。
 */
export function effectiveCap(
  table: StatCapTable | undefined,
  stat: Stat,
  raised = 0,
): number {
  const { base, unlocked } = capFor(table, stat);
  const wanted = Number.isFinite(raised) && raised > base ? raised : base;
  return wanted < unlocked ? wanted : unlocked;
}

/**
 * 正規化操作者/文件給的表:只留真的 stat key、兩個都是有限數、而且
 * `unlocked` 至少等於 `base`(打反了不會讓解鎖比一般上限還低)。
 * 未知的 key 直接 **丟掉**,不會夾帶著過去 —— 一個 typo 在下次稽核時會讀成
 * 「設定過了」。
 */
export function normalizeStatCaps(raw: unknown): StatCapTable {
  const out: Partial<Record<Stat, StatCap>> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    for (const stat of CAPPABLE_STATS) {
      const v = rec[stat];
      if (!v || typeof v !== "object") continue;
      const { base, unlocked } = v as { base?: unknown; unlocked?: unknown };
      if (typeof base !== "number" || !Number.isFinite(base)) continue;
      if (typeof unlocked !== "number" || !Number.isFinite(unlocked)) continue;
      out[stat] = Object.freeze({ base, unlocked: Math.max(base, unlocked) });
    }
  }
  return Object.freeze(out);
}

/**
 * 讀一份 `config.stat-caps@1` 文件(兩邊的 `Configs` registry 共用這一支)。
 *
 * ⚠️ 缺文件 / schema 不符 / caps 不是物件 → **出貨預設**。回空表的話,攻速上限
 * 會靜默退回 `STAT_CLAMPS` 的 4.0 而且 `unlocked` 也變 4.0 —— 解鎖功能整個消失
 * 卻不會有任何錯誤。見檔頭。
 */
export function statCapsFromDoc(doc: unknown): StatCapTable {
  if (!doc || typeof doc !== "object") return DEFAULT_STAT_CAPS;
  const d = doc as { schema?: unknown; caps?: unknown };
  if (d.schema !== "config.stat-caps@1" || typeof d.caps !== "object" || d.caps === null) {
    return DEFAULT_STAT_CAPS;
  }
  return normalizeStatCaps(d.caps);
}

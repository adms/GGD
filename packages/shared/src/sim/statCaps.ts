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
 * 一層還是兩層,是逐條屬性的決定
 * ---------------------------------------------------------------------------
 * `base < unlocked` 才叫兩層,而兩層唯一的用途是餵 `ModOp.CapRaise`。全出貨內容
 * 只有兩件道具帶 `CapRaise`(夢幻嗜血劍 godie-i00l、endless-edge),而且兩件都
 * 只碰攻速。所以 2026-08-01 加進來的**法強**是 `base === unlocked` 的單層 ——
 * 見 `AP_CAP_OPEN`。單層不是「還沒做完的兩層」:它就是「這條屬性沒有解鎖語意」,
 * 而且後台把 `unlocked` 拉高就變成兩層,一行程式都不用改。
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
 * 法術強度的出貨天花板 —— **刻意開到頂,今天不夾任何人**。
 *
 * owner 2026-08-01,對「惡夢魔王碎片 + 死之王套裝 = AP ×3.0」的裁決:
 *   「加一個 ap 上限就是同一個檔多一列 + 後台一個欄位,存檔生效」
 *   「AP ×3.0 … => 運氣那麼好剛好抽到就算了」
 * 兩句話合起來的意思是**把旋鈕做出來,但出貨轉到底**:owner 要的是「以後想夾
 * 的時候不用改程式」,不是「現在就夾」。所以這一列存在的價值全部在**可調**,
 * 而它的值必須大到不會碰到任何人。
 *
 * 100000 是怎麼來的(量出來的,不是拍的)—— `statCapsApOpen.test.ts` 在真的
 * `SimWorld` 裡把出貨內容能組出來最強的 AP 組合跑出來:等級 99、三圍 +40、
 * 六格塞滿 AP 道具(傲慢水龍王 +300% / 惡夢魔王碎片 +100% / 雅典娜的驚嘆號
 * +33% / 天地崩裂魔杖 +10% …)= **4,125.7**。100000 是它的 **24 倍**,而那條
 * 守衛把「至少 10 倍餘裕」釘住 —— 內容膨脹到快要碰到天花板時,測試會在玩家
 * 被夾到**之前**先紅。
 *
 * ⚠️ `base === unlocked` 是**單層**,而且是刻意的,不是抄攻速那一對。攻速的兩層
 * 是為了 `ModOp.CapRaise`(夢幻嗜血劍 godie-i00l 的「攻速上限提升到10」、
 * endless-edge)—— 全樹只有這兩件道具用得到,而且**沒有任何一件碰 ap**。
 * 一個 `base` 就已經開到頂的屬性,再給它一個更高的 `unlocked` 是純粹的死設定:
 * 沒有東西打得到 base,更不可能需要解鎖。要把 AP 的解鎖語意打開,後台把
 * `unlocked` 調到比 `base` 高就成立,一行程式都不用改(見 `effectiveCap`)。
 */
export const AP_CAP_OPEN = 100000;

/**
 * 出貨預設。
 *
 * · 攻速 4.0 / 10.0 —— owner 2026-07-28 點名的那一對,`unlocked` 真的會被
 *   `ModOp.CapRaise` 用到。
 * · 法強 100000 / 100000 —— owner 2026-08-01「所以要有這個欄位,但先不要夾」。
 *   見 `AP_CAP_OPEN`。
 *
 * 其餘屬性仍然**故意沒有列**:替它們憑空發明一個 `unlocked` 等於默默放寬平衡。
 * 要新增就在後台(或這裡)明確加一列。
 */
export const DEFAULT_STAT_CAPS: StatCapTable = Object.freeze({
  [Stat.AttackSpeed]: Object.freeze({ base: 4.0, unlocked: 10.0 }),
  [Stat.AbilityPower]: Object.freeze({ base: AP_CAP_OPEN, unlocked: AP_CAP_OPEN }),
});

// ------------------------------------------------------------- bounds ------
/**
 * 一格天花板的合法區間 —— **兩端都要有**。
 *
 * 這一段是補一個 CLAUDE.md 2026-07-29 點名過的缺陷:`zConfigStatCapsDoc` 之前
 * 只寫 `z.number().finite()`,也就是**上下界都沒有**,後台頁也只檢查
 * 「unlocked ≥ base」。50 打成 500 會過表單、寫進耐久覆蓋層,然後在下游變成
 * 一條沒有人講得出來的規則。
 *
 * ⚠️ 下界為什麼是 `STAT_CLAMPS` 的**下**界而不是 0。`finalizeStat` 算的是
 * `Math.max(lo, Math.min(hi, out))`,`lo` 永遠來自 `STAT_CLAMPS`。所以一個比
 * 地板還低的天花板不是「更嚴格的上限」,而是**地板無條件獲勝** —— 攻速 base
 * 填 0.1 的結果是每個人的攻速都變成 0.2(地板),那一格從此完全沒有作用,而且
 * 畫面上看不出來。沒有 `STAT_CLAMPS` 的屬性(法強、生命上限…)下界是 0。
 *
 * ⚠️ 上界是**防打錯的保險絲,不是平衡政策** —— 和 `content/schema/common.ts`
 * 的 `ITEM_MODIFIER_LIMITS` 同一個定位。每一條都遠高於出貨內容打得到的值,所以
 * 它擋不到任何一個真實的調整,只擋多打一個零。三條「比例」屬性的 1.0 是**語意
 * 的邊界**而不是餘裕:暴擊率 1.0 = 每一刀都暴擊、冷卻縮減 1.0 = 零冷卻、
 * 迴避 1.0 = 打不到,再高沒有第二種意思。
 *
 * 刻意是 EXHAUSTIVE 的 `Record<Stat, number>`(同 `baseBonus.ts` 的
 * `BASE_BONUS_MAX`):新增一條屬性會在這裡變成型別錯誤,而不是悄悄拿到 0
 * (= 那一列永遠填不進去)或 Infinity(= 又變回沒有上界)。
 */
export const STAT_CAP_MAX: Readonly<Record<Stat, number>> = Object.freeze({
  // 量出來的:全 115 張卡最強的 baseStats.maxHealth 是 4977,乘 maxHealth 9.0
  // 的環境倍率大約 45k。100 萬留了 20 倍以上。
  [Stat.MaxHealth]: 1_000_000,
  [Stat.MaxMana]: 1_000_000,
  [Stat.HealthRegen]: 10_000,
  [Stat.ManaRegen]: 10_000,
  [Stat.AttackDamage]: 100_000,
  // 出貨值就坐在這個天花板上 —— 「開到頂」在這裡是字面意思。見 `AP_CAP_OPEN`:
  // 量到的最強 AP 組合是 4,125.7,所以這一格能填的範圍正好是「有意義的那一段」
  // (往下夾),而多打一個零(1,000,000)會被擋下來。
  [Stat.AbilityPower]: AP_CAP_OPEN,
  [Stat.Armor]: 10_000,
  [Stat.MagicResist]: 10_000,
  // 暴擊傷害是倍率(1.75 = +75%),100 已經是 10000% 額外傷害。
  [Stat.CritDamage]: 100,
  // 攻擊距離:競技場單一 zone 半徑 24。
  [Stat.AttackRange]: 100,
  // 攻速的硬上限出貨是 10.0;100 是它的十倍。
  [Stat.AttackSpeed]: 100,
  [Stat.MoveSpeed]: 100,
  // 以下三條的 1.0 是語意邊界,不是餘裕(見檔頭)。
  [Stat.CritChance]: 1,
  [Stat.CooldownReduction]: 1,
  // 吸血 > 1 仍然有意義(回血多於打出的傷害),所以它不在上面那一組。
  [Stat.Lifesteal]: 10,
  [Stat.Evasion]: 1,
});

/**
 * 全屬性最寬的那一條上界。用在**認不出是哪條屬性**的時候(schema 的
 * `catchall`),所以它只保證「有界」,不保證緊。
 */
export const STAT_CAP_CEILING: number = Object.values(STAT_CAP_MAX).reduce(
  (a, b) => (b > a ? b : a),
  0,
);

/** 這一條屬性的天花板可以填的區間 `[min, max]`,兩端都是閉區間。 */
export function statCapBounds(stat: Stat): readonly [number, number] {
  const clamp = STAT_CLAMPS[stat];
  return [clamp ? clamp[0] : 0, STAT_CAP_MAX[stat]];
}

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
 * 正規化操作者/文件給的表:只留真的 stat key、兩個都是有限數、夾進
 * `statCapBounds(stat)`,而且 `unlocked` 至少等於 `base`(打反了不會讓解鎖比
 * 一般上限還低)。
 * 未知的 key 直接 **丟掉**,不會夾帶著過去 —— 一個 typo 在下次稽核時會讀成
 * 「設定過了」。
 *
 * ⚠️ 夾進區間是**三層守衛的最裡面一層**(同 `baseBonus.ts` 的
 * `normalizeBaseBonus`):後台頁擋在前面、Zod schema 擋在中間,而這裡擋的是
 * **任何**繞過那兩層的來源 —— 手改 `data/content-overlay/overlay.json`、舊版
 * 主機寫下的文件、測試夾具。
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
      const [lo, hi] = statCapBounds(stat);
      const fit = (n: number): number => (n < lo ? lo : n > hi ? hi : n);
      const b = fit(base);
      out[stat] = Object.freeze({ base: b, unlocked: Math.max(b, fit(unlocked)) });
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

/**
 * 基礎加成 (base bonus) — a FLAT amount added to every champion's final stat,
 * AFTER the combat-env multiplier and therefore NOT scaled by it.
 *
 * owner, 2026-07-28:「初始HP/MP/AP/AD/... 增加數值也要放到後台設定
 * 並且不參與倍率計算」.
 *
 * ⚠️ WHY THIS IS ITS OWN LAYER AND NOT PART OF `championStatBase`.
 * v0.9.8 shipped the +300 health inside the champion's BASE, which meant the
 * `maxHealth: 3.0` combat-env multiplier scaled it too — a player actually
 * received **+900**, not +300. The number on the admin page and the number in
 * the game were different things and nothing said so.
 *
 * The owner's rule removes that ambiguity: a base bonus is a flat grant handed
 * out at the end. `maxHealth: 3.0` triples what the champion earned; it does
 * not triple the gift.
 *
 *     final = clamp( (base + Σflat)·(1+ΣpctAdd)·Π(1+pctMult) · envFactor
 *                    + baseBonus[stat] )
 *                                        ↑ here, outside every multiplier
 *
 * IT IS CHAMPION-ONLY BY CONSTRUCTION. `recomputeStats` returns early unless
 * the entity has a `champion` component, and mobs never go through it — they
 * build their stats in `sim/mobs.ts`. So a mob borrowing a hero card as its
 * portrait cannot accidentally inherit the grant, and no opt-out flag is
 * needed to say so.
 */
import { ALL_STATS, STAT_CLAMPS, Stat } from "./stats/statTypes";
import {
  STAT_ENV_CHAIN,
  DEFAULT_COMBAT_ENV,
  statEnvFactor,
  type CombatEnvMultipliers,
  type StatEnvSubject,
} from "./combatEnv";
import { DEFAULT_STAT_CAPS, effectiveCap, type StatCapTable } from "./statCaps";

/** championId-independent, stat-keyed flat grants. Missing key = 0. */
export type BaseBonusTable = Readonly<Partial<Record<Stat, number>>>;

/**
 * Every stat is settable, but the SHIPPED table only fills the ones the owner
 * actually asked for. A zero is not a placeholder — it is the statement 「this
 * stat gets no gift」, and the admin table shows it as such.
 */
export const DEFAULT_BASE_BONUS: BaseBonusTable = Object.freeze({
  // owner 2026-07-30「目前玩家太容易死了」→ 300 → 650。
  // 這個數字 owner 已經動過三次(#265 立 300、2026-07-30 提到 650),它是後台可調的
  // 動態設定 —— 這裡只是「沒設定過時生效的預設」,不是唯一合法值。
  [Stat.MaxHealth]: 650,
});

/** Read one stat's grant, tolerating a partial / absent / junk table. */
export function baseBonusFor(table: BaseBonusTable | undefined, stat: Stat): number {
  const v = table?.[stat];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// ------------------------------------------------------------- bounds ------
/**
 * 每個 stat 的合法加成區間 (task #277) —— 這一層是 THREE LAYERS 的最裡面一層。
 *
 * ⚠️ 為什麼下限是 0,而不是「某個很小的負數」。
 * 這份表的語意是**贈禮**(owner 2026-07-28:「初始HP/MP/AP/AD/... **增加**數值」),
 * 而且它是**全域**的:一個數字同時作用在 115 張英雄卡上。`maxHealth` 沒有 clamp,
 * 所以 `-9999` 會讓每一位英雄的最終生命上限變成負數 —— 開場即死,而且後台不會有
 * 任何一個字說發生了什麼。要全域**下修**有另一個頁面而且語意正確:戰鬥系統
 * (combat-env) 的倍率是乘法的,`maxHealth: 0.5` 砍一半而不會把誰變成負血。
 * 兩個頁面各自守著自己的方向,是這一版刻意的分工。
 *
 * ⚠️ 上限怎麼來的 —— 有 clamp 的 6 個 stat 是**推導**出來的,不是拍的:
 * 一份比整個合法區間還大的贈禮,唯一能做到的事就是把所有人夾到同一條軌道上,
 * 而且面板會顯示一個玩家永遠拿不到的數字(#125)。所以上限 = `hi - lo`(區間跨度)。
 * 其餘 10 個沒有 clamp 的 stat 只能給一個「大到夠用、小到還是個數字」的天花板;
 * 它們寫在下面並且各自附上理由。
 */
export const BASE_BONUS_MIN = 0;

/**
 * 上限表。刻意是 EXHAUSTIVE 的 `Record<Stat, number>` —— 新增一個 stat 會在這裡
 * 變成型別錯誤,而不是悄悄拿到一個 0(= 這一列永遠不能設定)或 Infinity。
 * 有 clamp 的六項必須等於自己的區間跨度,由 `baseBonus.test.ts` 逐條驗算。
 */
export const BASE_BONUS_MAX: Readonly<Record<Stat, number>> = Object.freeze({
  // 沒有 clamp —— 天花板是「遠超過任何內容值,但仍是個有限數字」。
  // 全 115 張英雄卡的 baseStats.maxHealth 最大是 4977,20000 給了 4 倍餘裕。
  [Stat.MaxHealth]: 20000,
  [Stat.MaxMana]: 20000,
  [Stat.HealthRegen]: 200,
  [Stat.ManaRegen]: 200,
  [Stat.AttackDamage]: 2000,
  [Stat.AbilityPower]: 2000,
  [Stat.Armor]: 500,
  [Stat.MagicResist]: 500,
  // 暴擊傷害是倍率 (1.75 = +75%),+10 已經是 1000% 額外傷害。
  [Stat.CritDamage]: 10,
  // 攻擊距離:競技場單一 zone 半徑 24,50 已經涵蓋整座場地。
  [Stat.AttackRange]: 50,
  // 有 clamp —— 以下六項 = STAT_CLAMPS 的區間跨度 (hi - lo)。
  [Stat.AttackSpeed]: 3.8, // [0.2, 4.0]
  [Stat.MoveSpeed]: 12, // [2, 14]
  [Stat.CritChance]: 1, // [0, 1]
  [Stat.CooldownReduction]: 0.99, // [0, 0.99] —— 跟著 STAT_CLAMPS 走,見那裡的註解
  [Stat.Lifesteal]: 0.8, // [0, 0.8]
  [Stat.Evasion]: 0.8, // [0, 0.8]
  [Stat.SpellVamp]: 0.8, // [0, 0.8]
});

/** 這一個 stat 的加成合法區間 `[min, max]`。 */
export function baseBonusBounds(stat: Stat): readonly [number, number] {
  return [BASE_BONUS_MIN, BASE_BONUS_MAX[stat]];
}

/**
 * 這一個 stat 的**最終值** clamp(不是加成的 clamp)。有值代表:操作者填的數字
 * 可能被 `finalizeStat` 靜默吃掉,後台必須把這件事講出來 (task #279)。
 */
export function baseBonusFinalClamp(stat: Stat): readonly [number, number] | null {
  return STAT_CLAMPS[stat] ?? null;
}

/**
 * Normalise an operator-supplied table: keep only real stat keys with finite
 * numbers. An unknown key is DROPPED rather than carried, because a typo that
 * silently rides along in the doc would read as 「設定過了」 on the next audit.
 *
 * 值一律夾進 `baseBonusBounds(stat)` (task #277)。這是三層守衛的最後一道:
 * 後台頁面擋在前面、Zod schema 擋在中間,而這裡擋的是**任何**繞過那兩層的來源
 * (手改 data/content-overlay/overlay.json、舊版主機寫下的文件、測試夾具)。
 */
export function normalizeBaseBonus(raw: unknown): BaseBonusTable {
  const out: Partial<Record<Stat, number>> = {};
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    for (const stat of ALL_STATS) {
      const v = rec[stat];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const [lo, hi] = baseBonusBounds(stat);
      const clamped = v < lo ? lo : v > hi ? hi : v;
      if (clamped !== 0) out[stat] = clamped;
    }
  }
  return Object.freeze(out);
}

/**
 * Read a `config.base-bonus@1` doc (from either side's `Configs` registry) into
 * a table. A missing / wrong-schema / junk doc answers the SHIPPED DEFAULT, not
 * an empty table: an operator who never opened the page must get the 300, and a
 * doc that failed to load must not silently take it away.
 *
 * ⚠️ 這是「缺文件 = 預設」而不是「缺文件 = 沒有」的那種預設。兩者差 300 點血,
 * 而且不會有任何錯誤訊息 —— 所以它寫在這裡一次,兩邊共用。
 */
export function baseBonusFromDoc(doc: unknown): BaseBonusTable {
  if (!doc || typeof doc !== "object") return DEFAULT_BASE_BONUS;
  const d = doc as { schema?: unknown; bonus?: unknown };
  if (d.schema !== "config.base-bonus@1" || typeof d.bonus !== "object" || d.bonus === null) {
    return DEFAULT_BASE_BONUS;
  }
  return normalizeBaseBonus(d.bonus);
}

/**
 * THE one definition of 「最終值」 for a champion stat: environment multiplier
 * (× 身體放大倍數 for `Stat.AttackRange` only, GH#252), then the flat base
 * bonus, then the clamp — in that order, for every caller.
 *
 * ⚠️ 這個函式存在的唯一理由是**只有一份順序**。sim 的 `recomputeStats` 與所有顯示
 * 面板(選角屬性表、圖鑑、後台數值體檢)本來各自寫 `base × env`,#125 才成立。
 * 加上一個「不參與倍率」的項之後,兩邊只要有一邊忘了加,面板就會少 300 —— 而
 * 那正是玩家會截圖來問「為什麼我實際血量跟這裡不一樣」的那個數字。
 *
 * `v` 是**已經套完所有 modifier 層**的值(道具 / 三選一 / buff)。base bonus 排在
 * 它們後面不是隨意的:一件 +10% 生命的裝備放大的是英雄自己掙來的血量,不是這份
 * 系統贈禮。
 */
export interface FinalizeStatOptions {
  /** 戰鬥系統倍率表。缺 = 中性全 1.0。 */
  env?: CombatEnvMultipliers;
  /** 基礎加成表。缺 = **出貨預設**(生命 +300),不是空表。 */
  baseBonus?: BaseBonusTable;
  /**
   * 屬性上限表 (`config.stat-caps@1`, GH#286)。缺 = **出貨預設**,不是空表 ——
   * 空表會讓 `capFor` 退回 `STAT_CLAMPS` 而且 `unlocked === base`,解鎖功能靜默
   * 消失。見 sim/statCaps.ts。
   */
  caps?: StatCapTable;
  /**
   * 這個單位、這條屬性身上所有 `ModOp.CapRaise` **取 max** 的結果(0 = 沒有
   * 任何解鎖來源)。不是加總:見 modifiers.ts `CapRaise`。
   */
  capRaise?: number;
  /**
   * 身體放大倍數換算出來的**攻擊距離倍率**(GH#252,見 sim/bodyScale.ts 的
   * `attackRangeScaleFactor`)。**只**作用在 {@link Stat.AttackRange};其他
   * 15 條屬性完全看不到它,所以傳與不傳對它們逐位元相同。
   *
   * 位置和 `env` 同一格(相乘,在基礎加成與 clamp **之前**):它描述的是
   * 「這個身體本來就搆得比較遠」,和 `combatEnv.attackRange` 那個全域旋鈕是
   * 同一種東西,而基礎加成是系統贈禮 —— 贈禮不該被體型放大。
   *
   * 缺 = 1(不連動),所以每一個舊呼叫端逐位元不變。
   */
  rangeScale?: number;
  /**
   * 這個數字是**算給誰**的（2026-08-10）。只有 `STAT_ENV_CHAIN` 裡帶
   * `byAttackType` 的那一格會讀它 —— 今天只有 {@link Stat.MoveSpeed}，其他 15 條
   * 屬性傳與不傳逐位元相同。
   *
   * ⚠️ 缺 = **中性**，不是「當成近戰」。小怪 / 守衛塔 / 投射物根本沒有英雄卡，
   * 猜一邊等於把一個平衡旋鈕靜默套到 owner 沒在講的單位上。要動到所有單位的
   * 旋鈕是 `moveSpeed` 那一格，它一直都在。
   */
  subject?: StatEnvSubject;
}

export function finalizeStat(
  v: number,
  stat: Stat,
  opts: FinalizeStatOptions = {},
): number {
  const env = opts.env ?? DEFAULT_COMBAT_ENV;
  // 環境倍率是一條**鏈**（sim/combatEnv.ts `STAT_ENV_CHAIN`）：多數屬性只有一格，
  // 魔抗有兩格（defense × magicResistMult），移速的第二格由 `subject` 決定。
  // 中性 = 1.0，而 `x * 1` 對任何有限數逐位元等於 `x`，所以「三格缺席」與這條鏈
  // 出現之前的單一倍率算式**不是近似相同，是同一個 double**。
  let out = v;
  const chain = STAT_ENV_CHAIN[stat];
  if (chain !== undefined) {
    for (const link of chain) out *= statEnvFactor(link, env, opts.subject);
  }
  if (stat === Stat.AttackRange) {
    const rs = opts.rangeScale;
    if (typeof rs === "number" && Number.isFinite(rs) && rs > 0) out *= rs;
  }
  // 位置就是語意:在 `*=` **之後** = 不參與倍率(owner 2026-07-28);在 clamp
  // **之前** = 上限仍然管得到它。
  out += baseBonusFor(opts.baseBonus ?? DEFAULT_BASE_BONUS, stat);
  // 上界來自 cap 表 + 這個單位的解鎖量;下界永遠是 STAT_CLAMPS 的(cap 表只描述
  // 天花板,`CapRaise` 沒有「解鎖下限」的語意)。
  const clamp = STAT_CLAMPS[stat];
  const lo = clamp ? clamp[0] : Number.NEGATIVE_INFINITY;
  const hi = effectiveCap(opts.caps ?? DEFAULT_STAT_CAPS, stat, opts.capRaise ?? 0);
  return Math.max(lo, Math.min(hi, out));
}

/** 中文標籤,後台表格與 codex 共用一份,避免兩邊叫法不同。 */
export const STAT_LABEL_ZH: Readonly<Record<Stat, string>> = Object.freeze({
  [Stat.MaxHealth]: "生命上限",
  [Stat.HealthRegen]: "生命回復 /秒",
  [Stat.MaxMana]: "魔力上限",
  [Stat.ManaRegen]: "魔力回復 /秒",
  [Stat.AttackDamage]: "攻擊力",
  [Stat.AbilityPower]: "法術強度",
  [Stat.Armor]: "護甲",
  [Stat.MagicResist]: "魔法抗性",
  [Stat.AttackSpeed]: "攻擊速度 /秒",
  [Stat.MoveSpeed]: "移動速度",
  [Stat.CritChance]: "暴擊率",
  [Stat.CritDamage]: "暴擊傷害",
  [Stat.CooldownReduction]: "冷卻縮減",
  [Stat.Lifesteal]: "吸血",
  [Stat.AttackRange]: "攻擊距離",
  [Stat.Evasion]: "迴避",
  [Stat.SpellVamp]: "技能吸血",
});

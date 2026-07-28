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
import { STAT_ENV_KEY, DEFAULT_COMBAT_ENV, type CombatEnvMultipliers } from "./combatEnv";

/** championId-independent, stat-keyed flat grants. Missing key = 0. */
export type BaseBonusTable = Readonly<Partial<Record<Stat, number>>>;

/**
 * Every stat is settable, but the SHIPPED table only fills the ones the owner
 * actually asked for. A zero is not a placeholder — it is the statement 「this
 * stat gets no gift」, and the admin table shows it as such.
 */
export const DEFAULT_BASE_BONUS: BaseBonusTable = Object.freeze({
  [Stat.MaxHealth]: 300,
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
  [Stat.CooldownReduction]: 0.45, // [0, 0.45]
  [Stat.Lifesteal]: 0.8, // [0, 0.8]
  [Stat.Evasion]: 0.8, // [0, 0.8]
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
 * THE one definition of 「最終值」 for a champion stat: environment multiplier,
 * then the flat base bonus, then the clamp — in that order, for every caller.
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
export function finalizeStat(
  v: number,
  stat: Stat,
  env: CombatEnvMultipliers = DEFAULT_COMBAT_ENV,
  baseBonus: BaseBonusTable | undefined = DEFAULT_BASE_BONUS,
): number {
  const envKey = STAT_ENV_KEY[stat];
  let out = envKey !== undefined ? v * env[envKey] : v;
  // 位置就是語意:在 `*=` **之後** = 不參與倍率(owner 2026-07-28);在 clamp
  // **之前** = 上限仍然管得到它。
  out += baseBonusFor(baseBonus, stat);
  const clamp = STAT_CLAMPS[stat];
  return clamp ? Math.max(clamp[0], Math.min(clamp[1], out)) : out;
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
});

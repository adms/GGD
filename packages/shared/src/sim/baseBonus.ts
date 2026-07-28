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
import { DEFAULT_STAT_CAPS, effectiveCap, type StatCapTable } from "./statCaps";

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

/**
 * Normalise an operator-supplied table: keep only real stat keys with finite
 * numbers. An unknown key is DROPPED rather than carried, because a typo that
 * silently rides along in the doc would read as 「設定過了」 on the next audit.
 */
export function normalizeBaseBonus(raw: unknown): BaseBonusTable {
  const out: Partial<Record<Stat, number>> = {};
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    for (const stat of ALL_STATS) {
      const v = rec[stat];
      if (typeof v === "number" && Number.isFinite(v) && v !== 0) out[stat] = v;
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
}

export function finalizeStat(
  v: number,
  stat: Stat,
  opts: FinalizeStatOptions = {},
): number {
  const env = opts.env ?? DEFAULT_COMBAT_ENV;
  const envKey = STAT_ENV_KEY[stat];
  let out = envKey !== undefined ? v * env[envKey] : v;
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
});

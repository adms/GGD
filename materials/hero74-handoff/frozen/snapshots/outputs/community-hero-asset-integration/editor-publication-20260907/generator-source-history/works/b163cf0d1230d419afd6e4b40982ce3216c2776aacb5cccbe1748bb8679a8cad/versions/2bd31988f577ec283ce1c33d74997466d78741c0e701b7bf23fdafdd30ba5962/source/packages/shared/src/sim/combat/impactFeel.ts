/**
 * ⭐⭐ 「**一發打起來有多重**」的十三個數字 —— ⛔ 在此之前它們**只有改程式碰得到**。
 *
 * ── 為什麼這一支存在 ────────────────────────────────────────────────────
 * owner 的大目標逐字：「開放讓玩家自己設計 英雄、技能、特效⋯**所有功能都要可
 * JSON 操作設定**」。⇒ 一個「只能改程式才碰得到的角落」就是那句話的反例。
 *
 * 2026-09-01 的普查（`ops/codeOnlyKnobs.test.ts`）量到 **53 個**這種角落，
 * ⭐ 而**最大的兩窩**就是這裡：`combat/damage.ts` 7 個 ＋ `combat/hitFeel.ts` 6 個。
 * ⚠️ 它們是同一個家族（「打中的那一下」），⛔ 卻散在兩個檔的模組層常數裡。
 *
 * ── ⭐ 為什麼是**一個新分節**，⛔ 不是塞進既有的 `hitstop` ─────────────────
 * `config.combat-feel@1` 的 `hitstop` 分節管的是**行為旗標**
 * （誰的腳被按住 · 保險絲）＋一個總倍率 `scale`。
 * ⇒ 把「一發幾 tick」「多重才算重擊」塞進去，會讓那一節同時是開關與量值兩件事。
 * ⭐ 這一節只管**量值**：衝擊 → tick 的換算率、分級門檻、演出倍率。
 *
 * ── ⛔ 這一支**沒有改變任何出貨行為** ───────────────────────────────────
 * 每一格的預設**逐位元等於**原本那個常數（下面逐格標了它從哪裡搬過來）。
 * ⇒ 這一次的改動是「**它現在有一個 JSON 住處**」，⛔ 不是「它變了」。
 *
 * ⚠️ 讀的時候一律走 `impactFeelRules(world)`，⛔ 不要直接讀
 * `world.combatFeel.impactFeel!` —— 半張表的既有測試（`{ knockback, standstill }`）
 * 會讓它是 undefined，而 `undefined` 一路傳下去會變成 `NaN`，
 * ⭐ 而 `NaN` 讓每個比較都是 false ⇒ 定格永遠不發生，**完全無聲**
 *   （這正是 `facing` 那一格的檔頭記過的前科）。
 */
import type { SimWorld } from "../SimWorld";

export interface ImpactFeelRules {
  /** 每多少「衝擊」加一 tick 定格（`damage.ts` 的 `HITSTOP_PER_IMPACT`）。 */
  hitstopPerImpact: number;
  /** 定格的**強調上限** —— 爆擊／破防可以超過基礎 6（`HITSTOP_COUNTER_CAP`）。 */
  hitstopCounterCap: number;
  /** 衝擊到這裡算「中」（`TIER_MEDIUM_IMPACT`）。 */
  tierMediumImpact: number;
  /** 衝擊到這裡算「重」（`TIER_HEAVY_IMPACT`）。 */
  tierHeavyImpact: number;
  /** 每多少衝擊加一 tick 受身硬直（`HITSTUN_PER_IMPACT`）。 */
  hitstunPerImpact: number;
  /** 硬直至少比定格長幾 tick（`HITSTUN_ADVANTAGE`）—— 出手方的先手。 */
  hitstunAdvantage: number;
  /** 擊倒躺地幾 tick（`KNOCKDOWN_TICKS`）。 */
  knockdownTicks: number;
  /** 被擋下時螢幕震動打幾折（`hitFeel.ts` 的 `BLOCK_SHAKE_MULT`）。 */
  blockShakeMult: number;
  /** 被擋下時鏡頭踢打幾折（`BLOCK_CAMKICK_MULT`）。 */
  blockCamKickMult: number;
  /** EX 命中的震動倍率（`EX_SHAKE_MULT`）。 */
  exShakeMult: number;
  /** EX 震動的上限（`EX_SHAKE_CAP`）—— ⛔ 倍率乘完之後夾在這裡。 */
  exShakeCap: number;
  /** EX 命中鏡頭踢的**下限**（`EX_CAMKICK_FLOOR`）。 */
  exCamKickFloor: number;
  /** EX 命中的純演出凍結 tick（`EX_FREEZE_TICKS`）—— ⛔ 不影響 sim。 */
  exFreezeTicks: number;
}

/**
 * ⭐ 出貨值 —— **逐格等於**它搬過來之前的那個常數。
 * ⛔ 改這裡等於改出貨行為；要調的人請改 `content/config/combat-feel.json`。
 */
export const DEFAULT_IMPACT_FEEL: ImpactFeelRules = Object.freeze({
  hitstopPerImpact: 55,
  hitstopCounterCap: 8,
  tierMediumImpact: 60,
  tierHeavyImpact: 120,
  hitstunPerImpact: 40,
  hitstunAdvantage: 2,
  knockdownTicks: 14,
  blockShakeMult: 0.6,
  blockCamKickMult: 0.5,
  exShakeMult: 1.25,
  exShakeCap: 1.4,
  exCamKickFloor: 0.7,
  exFreezeTicks: 8,
});

/** 一格的上下界 —— ⚠️ 與 Zod 那一份**逐字相同**（admin 的鏡射測試逐格比對）。 */
const BOUNDS: Readonly<Record<keyof ImpactFeelRules, readonly [number, number]>> = Object.freeze({
  hitstopPerImpact: [1, 1000],
  hitstopCounterCap: [0, 60],
  tierMediumImpact: [0, 10000],
  tierHeavyImpact: [0, 10000],
  hitstunPerImpact: [1, 1000],
  hitstunAdvantage: [0, 60],
  knockdownTicks: [0, 300],
  blockShakeMult: [0, 4],
  blockCamKickMult: [0, 4],
  exShakeMult: [0, 4],
  exShakeCap: [0, 8],
  exCamKickFloor: [0, 8],
  exFreezeTicks: [0, 60],
});

export function normalizeImpactFeelRules(raw: unknown): ImpactFeelRules {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const out = { ...DEFAULT_IMPACT_FEEL } as Record<string, number>;
  for (const k of Object.keys(DEFAULT_IMPACT_FEEL) as (keyof ImpactFeelRules)[]) {
    const v = r[k];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const [lo, hi] = BOUNDS[k];
    out[k] = Math.min(hi, Math.max(lo, v));
  }
  return Object.freeze(out) as unknown as ImpactFeelRules;
}

/**
 * ⭐ **唯一**的讀法。缺格 ⇒ 出貨值 ⇒ 行為逐位元不變。
 * ⛔ 不要直接讀 `world.combatFeel.impactFeel` —— 見檔頭那段 `NaN` 的前科。
 */
export function impactFeelRules(world: SimWorld): ImpactFeelRules {
  return world.combatFeel?.impactFeel ?? DEFAULT_IMPACT_FEEL;
}

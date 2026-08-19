import { z } from "zod";
import { SPREAD_MAX_RADIUS } from "../../../sim/effects/spreadLimits";
import { TAUNT_MAX_DURATION_SEC, TAUNT_MAX_TARGETS } from "../../../sim/taunt";
import {
  EFFECT_COMMON_SHAPE,
  zAoeTier,
} from "./_shared";

export const zTaunt =
/**
 * taunt — 嘲弄 (鍊金術之盾 godie-i06q). Mirrors the `taunt` member of
 * `EffectDef`. The mechanic, the state model and every operator-facing
 * decision field live in `sim/taunt.ts`; this is only the authoring surface.
 *
 * BOTH ENDS BOUNDED, and the two ceilings guard DIFFERENT mis-parses:
 *   · `durationSec` ≤ TAUNT_MAX_DURATION_SEC — 0.5 typed as 50 is a taunt
 *     that outlives the round, i.e. one shield owning every enemy's targeting
 *     for the whole fight. The FLOOR is 0.034 s for the reason
 *     `grantAttribute.durationSec` has one: `Math.round(sec/dt)` at 30 Hz is
 *     0 ticks below that — a blank that reads exactly like a broken feature.
 *   · `radius` ≤ SPREAD_MAX_RADIUS — the SAME ceiling every other authored
 *     circle carries, and for the same reason: a w3x `Area` column pasted
 *     straight in (200/300/450) is ~54.5× too large and would taunt the whole
 *     duel zone. Reusing that constant rather than inventing a taunt-specific
 *     one is deliberate — two ceilings for 「一個圓有多大」 would drift.
 */
z
  .object({
    kind: z.literal("taunt"),
    ...EFFECT_COMMON_SHAPE,
    /** 持續幾秒 (乘上後台的 `tauntRules.durationMult` 之後換算成絕對 tick) */
    durationSec: z.number().min(0.034).max(TAUNT_MAX_DURATION_SEC),
    /**
     * 範圍 (GGD 單位), 圓心是**施法者自己**。省略 = 單體, 掛在這個效果自己
     * 解析出來的目標上。走 `combatEnv.abilityRange`, 和其它每一個 AoE 一樣。
     */
    radius: z.number().positive().max(SPREAD_MAX_RADIUS).optional(),
    radiusTier: zAoeTier.optional(),
    /** 一次最多拉幾個人 (由近到遠)。省略 = TAUNT_MAX_TARGETS */
    maxTargets: z.number().int().min(1).max(TAUNT_MAX_TARGETS).optional(),
    /**
     * ⭐ [反向嘲諷]（戰鬥力探測器）—— 這個圓**拉誰**。
     *
     * 省略 = `enemies` = 今天那一行 `enemiesInCircle`（`sim/effects/taunt.ts`），
     * 所以出貨的鍊金術之盾（`content/items/godie-i06q.json`）**逐位元不變**。
     */
    side: z.enum(["allies", "enemies"]).optional(),
    /**
     * ⭐ 被拉的人**被迫打誰**。省略 = `caster`（施法者自己），也就是
     * `applyTaunt(world, s, ctx.caster, …)` 今天寫死的那一格。
     *
     * ⛔ 不可以和 {@link side} 合成一格（「拉隊友去打敵人」與「拉敵人來打我」
     * 是兩根獨立的軸），⛔ 也不可以叫 `applyTo` —— `zApplyToSelfOrTarget`
     * 已經把 `applyTo` 定義成「效果落在誰身上」。
     */
    forcedTarget: z.enum(["caster", "target"]).optional(),
    /**
     * 附近的中立單位（殭屍）也一起拉。省略 = `false`。
     *
     * ⚠️ **只在 `side:"allies"` 有作用**：`enemies` 那一側本來就含
     * `MONSTER_TEAM`（`sim/mobs.ts` 的 255），所以這一格對它是嚴格的 no-op。
     * ⛔ 不要把它實作成雙向 —— 那會改掉出貨行為（鍊金術之盾不再拉殭屍，
     * 而那是它在 PvE 唯一的價值）。
     */
    includeNeutrals: z.boolean().optional(),
  })
  .strict();

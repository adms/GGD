import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { CONVERT_TEAM_MAX_HELD, CONVERT_TEAM_MAX_SEC } from "../../../sim/effects/kindLimits";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
} from "./_shared";

export const zConvertTeam =
/**
 * convertTeam — 【陣營轉換】(大師球)。把一隻單位**暫時**借到自己這一隊。
 * mirrors the `convertTeam` member of `EffectDef`。
 *
 * ⛔ 這一版**沒有** `toTeam`（`"neutral"` 那個成員）與 `killCredit`：
 * flag 只編 0..3，多一個成員就是「下拉裡有、引擎不發」；而
 * `summon.killCredit:"owner"` 至今被 handler 拒絕，⛔ 不要一個只有單一
 * 合法成員的 enum。
 */
z
  .object({
    kind: z.literal("convertTeam"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
    shape: z.enum(["single", "circle"]),
    radius: z.number().positive().max(40).optional(),
    radiusTier: zAoeTier.optional(),
    /** 什麼時候歸位。省略 = `death`（打死才還）。 */
    until: z.enum(["death", "duration", "roundEnd"]).optional(),
    /** 借多久（秒）。只有 `until:"duration"` 讀得到它。 */
    durationSec: z.number().positive().max(CONVERT_TEAM_MAX_SEC).optional(),
    /** 同時能控幾隻。省略 = 2。 */
    maxHeld: z.number().int().min(1).max(CONVERT_TEAM_MAX_HELD).optional(),
    /** 同一個受害者一回合能不能被重捕。省略 = `true`（不能）。 */
    oncePerRoundPerVictim: z.boolean().optional(),
    /**
     * ⚠️ **勝負語意的開關**（拿給 owner 的那一格）。
     *
     * `MatchController.teamAliveCount` 讀 `seat.teamId`（捕獲不動它），而
     * `sim/revive.ts::teamAliveInZone` 讀 `world.team`（捕獲會動）——
     * 被我方捕獲的**敵方英雄**，在勝負判定上算不算還替敵隊活著。
     *
     * ⭐ **省略 = `false`** —— owner 2026-08-18 逐字：「物理意義上，我們比較像是**複製一個敵方隊友短暫在這一回合加入我方**，所以**實質上這個單位就是我方單位**，就算他造成任何傷害或者戰績都是算在我方而非那個敵方單位上」
     *
     * ⚠️ 這**推翻**了盤點時的建議（維持 `true`＝仍替敵隊活著）。第〇·六守則：
     * 高層級（owner 的新裁決）贏，而且**預設啟動**；`true` 留著是為了一鍵回頭，
     * ⛔ 不替它寫第二條測試。
     */
    countsForOriginalTeam: z.boolean().optional(),
  })
  .strict();

/**
 * ⭐ 這一支的跨欄位檢查 —— 分片前它是 `refineEffectDef` 裡的一條 `if`。
 * ⛔ 掛在 `index.ts` 的派發表上，⛔ 不是掛在下面那個 `z.object` 上：
 *    `.superRefine` 會把 `ZodObject` 變成 `ZodEffects`，而
 *    `z.discriminatedUnion` 只收 `ZodObject`（zod 的型別約束，⛔ 不是風格）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "convertTeam" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);
};

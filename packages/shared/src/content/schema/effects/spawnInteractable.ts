import { z } from "zod";
import { EFFECT_COMMON_SHAPE, zEffectDef } from "./_shared";

/**
 * 【互動物】（GH#1189 瑟雷西 W 燈籠）—— 技能在地上放一個**隊友自己決定要不要用**的物件。
 *
 * ⭐ 與 `spawnThresholds.onCross` 是同一個形狀的**反面**：邊界陣是「敵人碰到就觸發」，
 *   互動物是「⛔ 碰到不算，⭐ 隊友**送出 `interact{objectId}` 指令**才觸發」——
 *   ⇒ 施法者**不能**替隊友決定（票文：「不能由施法者強制把隊友拉走」）。
 * `onAccept` 以**接受者**為目標、原施法者為 caster 跑（例：`blink{to:"caster",applyTo:"target"}` 飛回施法者）。
 *
 * 伺服器驗：同隊且不是施法者本人 · 活著 · 同區且站在 `radius` 內 · 還沒到期／沒用完 · 同一人不重複接受。
 * 消費端：`sim/interactables.ts`（`acceptInteractable` ← `CommandSystem` 的 `interact`；`interactableSystem` 管到期）。
 */
export const zSpawnInteractable = z
  .object({
    kind: z.literal("spawnInteractable"),
    ...EFFECT_COMMON_SHAPE,
    /** 接受距離（格）：隊友的身體要碰到以物件為心、這個半徑的圓才點得到 */
    radius: z.number().positive().max(20),
    /** 存活秒數；到期消失 */
    durationSec: z.number().positive().max(60),
    /** 最多幾位隊友可以用（用完即消失）。缺 = 1 */
    maxUses: z.number().int().min(1).max(12).optional(),
    /** 放在哪：`point` = 這次施放的落點（ground／skillshot）；`self` = 施法者腳下。缺 = point */
    at: z.enum(["point", "self"]).optional(),
    /** 隊友接受那一刻，以**接受者**為目標跑的效果樹 */
    onAccept: z.array(z.lazy(() => zEffectDef)),
  })
  .strict();

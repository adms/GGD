import { z } from "zod";
import { EFFECT_COMMON_SHAPE } from "./_shared";

/**
 * 【暫時障礙】（GH#1190 鄂爾 Q）—— 技能生出來的**真碰撞**圓柱：走路推不過、衝刺撞得到（`dash.onEndOn:"blocked"`）、
 * 到期或被 `dash.shatter:true` 撞碎就消失。⛔ 視覺模型不算地形 —— 這一格生的是碰撞體，畫面另外走 `obstacleSpawn` 事件。
 * 消費端：`sim/obstacles.ts`（`obstaclesFor`）餵給 MovementSystem／wallBlock，⛔ 不改全域 `pillarsBlock`。
 */
export const zSpawnObstacle = z
  .object({
    kind: z.literal("spawnObstacle"),
    ...EFFECT_COMMON_SHAPE,
    /** 圓柱半徑（格） */
    radius: z.number().positive().max(10),
    /** 存活秒數；到期消失 */
    durationSec: z.number().positive().max(120),
    /**
     * 落點：`point` = 這次施放解析出的落點；`self` = 施法者腳下。缺 = point。
     * ⚠️ **skillshot 不解析落點**（`abilitySystem.ts` 的 `case "skillshot"` 只算方向）⇒ 退回施法者腳下 ——
     * 「直線技能的**終點**」要寫 `at:"self"` ＋ `offsetForwardU`（GH#1190 鄂爾 Q）。
     */
    at: z.enum(["point", "self"]).optional(),
    /**
     * ⭐【沿施放方向前推】GH#1190 —— 與 `spawnModelFx.offsetForwardU` **同名同語意**：
     * 以 `at` 為錨點，沿這次施放的方向（沒有方向時用施法者面向）往前推幾格。負值＝往後。缺 = 0 ⇒ 逐位元同以前。
     */
    offsetForwardU: z
      .number()
      .min(-24)
      .max(24)
      .optional()
      .describe("沿施放方向把柱子往前推幾格（直線技能的終點＝那條線的長度）。留空＝就在落點上。"),
    /** 能不能被 `dash.shatter:true` 的衝刺撞碎。缺 = true */
    shatterable: z.boolean().optional(),
  })
  .strict();

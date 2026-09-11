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
    /** 落點：`point` = 這次施放解析出的落點（ground／skillshot）；`self` = 施法者腳下。缺 = point */
    at: z.enum(["point", "self"]).optional(),
    /** 能不能被 `dash.shatter:true` 的衝刺撞碎。缺 = true */
    shatterable: z.boolean().optional(),
  })
  .strict();

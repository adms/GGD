import { z } from "zod";
import { EFFECT_COMMON_SHAPE } from "./_shared";
import { TIME_STOP_MAX_DURATION_SEC, TIME_STOP_MAX_RADIUS, TIME_STOP_MAX_HITS } from "../../../sim/timeStop";

export const zTimeStop = z.object({
  kind: z.literal("timeStop"), ...EFFECT_COMMON_SHAPE,
  radius: z.number().positive().max(TIME_STOP_MAX_RADIUS).describe("局部時停半徑；凍結範圍內敵人與敵方投射物。"),
  durationSec: z.number().positive().max(TIME_STOP_MAX_DURATION_SEC).describe("世界時間秒數；不凍結對決倒數或此期限。死亡、換區或換回合會取消。"),
  maxQueuedHits: z.number().int().min(1).max(TIME_STOP_MAX_HITS).optional().describe("施法者待結算命中上限，預設 64；滿額後丟棄並發出事件，到期依原順序結算。"),
}).strict();

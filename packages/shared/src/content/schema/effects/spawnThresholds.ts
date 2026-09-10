import { z } from "zod";
import { EFFECT_COMMON_SHAPE, zEffectDef } from "./_shared";

/**
 * 【邊界陣】（GH#1197 瑟雷西 R）—— 以落點為中心放一圈 `sides` 段**可穿越的邊界**（正多邊形的邊），
 * 每一段在**被敵人穿越的那一 tick**觸發 `onCross`（目標 = 穿越者）並**獨立消失**；到期全部清掉。
 * ⛔ 不是一圈即時傷害（那是 damageArea）、⛔ 不是阻路柱（那是 #1190 的暫時地形）—— 邊界不擋人，穿過才算。
 * 一段只觸發一次；同一個人可以穿不同段各觸發一次。⛔ 零三角函式：頂點表是常數（sides 只收 3/4/5/6/8）。
 */
export const zSpawnThresholds = z
  .object({
    kind: z.literal("spawnThresholds"),
    ...EFFECT_COMMON_SHAPE,
    /** 幾段（正多邊形的邊數）。瑟雷西 R = 5 */
    sides: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(8)]),
    /** 中心到頂點的距離（格） */
    radius: z.number().positive().max(40),
    /** 存活秒數；到期未被穿越的段一起消失 */
    durationSec: z.number().positive().max(60),
    /** 穿越那一段時對穿越者跑的效果樹（減速／傷害／…） */
    onCross: z.array(z.lazy(() => zEffectDef)),
  })
  .strict();

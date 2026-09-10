import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { TRAP_MAX_ALIVE, TRAP_MAX_DURATION_SEC, TRAP_MAX_RADIUS } from "../../../sim/trapState";
import { EFFECT_COMMON_SHAPE, zEffectDef } from "./_shared";
export const zTrap = z.object({
  kind: z.literal("trap"), ...EFFECT_COMMON_SHAPE,
  radius: z.number().positive().max(TRAP_MAX_RADIUS).describe("定點陷阱觸發半徑（GGD 單位）。"),
  durationSec: z.number().positive().max(TRAP_MAX_DURATION_SEC).describe("從放置開始計算的存續秒數。"),
  armDelaySec: z.number().min(0).max(TRAP_MAX_DURATION_SEC).optional().describe("放置後多久才能觸發；留空立即啟動。"),
  maxAlive: z.number().int().min(1).max(TRAP_MAX_ALIVE).optional().describe("同一英雄同一技能的陷阱上限；留空一個，超過替換最早者。"),
  triggerAt: z.enum(["attacker", "victim"]).optional().describe("檢查敵方攻擊者或受保護友軍是否在範圍；預設 attacker。"),
  cancelAttack: z.boolean().optional().describe("是否取消這次普攻；預設 true，遠程不產生彈體。"),
  onOwnerDeath: z.enum(["despawn", "persist"]).optional().describe("主人死亡後移除（預設）或繼續留場。"),
  onTrigger: z.array(z.lazy(() => zEffectDef)).min(1).max(16).describe("單次觸發後消失；施法者為主人，目標為敵方攻擊者。"),
}).strict();
export function refine(e: Extract<EffectDef, { kind: "trap" }>, ctx: z.RefinementCtx): void {
  if ((e.armDelaySec ?? 0) >= e.durationSec) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["armDelaySec"], message: "啟動時間必須早於到期時間。" });
}

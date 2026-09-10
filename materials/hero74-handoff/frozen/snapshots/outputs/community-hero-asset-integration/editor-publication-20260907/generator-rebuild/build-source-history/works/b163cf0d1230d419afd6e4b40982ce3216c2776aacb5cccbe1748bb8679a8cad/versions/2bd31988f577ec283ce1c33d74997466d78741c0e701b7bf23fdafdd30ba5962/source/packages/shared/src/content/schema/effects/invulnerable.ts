import { z } from "zod";
import {
  EFFECT_COMMON_SHAPE,
} from "./_shared";

export const zInvulnerable =
z
  .object({
    kind: z.literal("invulnerable"),
    ...EFFECT_COMMON_SHAPE,
    /** seconds. Capped hard: an unbounded immunity is an unwinnable round. */
    durationSec: z.number().positive().max(30),
    applyTo: z.enum(["self", "target"]).optional(),
    /**
     * 傷害免疫的範圍。ABSENT = "all" = WC3 的 `Avul`。`"none"` 是**純免控**
     * (07-01 臨、兵、鬥「可抵擋對方負性魔法」),`"magic"` 是魔法免疫
     * (47-04 天翔龍閃 / 97-04 火產靈神 / 99-04)。
     */
    blocksDamage: z.enum(["all", "none", "physical", "magic"]).optional(),
    /** 真實傷害(火圈 #270)。ABSENT = 跟著 `blocksDamage === "all"` */
    blocksTrueDamage: z.boolean().optional(),
    /**
     * 免控(stun / root / 減速)。**ABSENT = false**,刻意與免傷分開 —— 見
     * sim/effects/invulnerable.ts 檔頭 ②。
     */
    blocksControl: z.boolean().optional(),
  })
  .strict();

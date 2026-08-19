import { z } from "zod";
import {
  EFFECT_COMMON_SHAPE,
  zRankScalar,
} from "./_shared";

export const zChampionForm =
/**
 * championForm (task #249) — mirrors the `championForm` member of
 * `EffectDef`. There is deliberately NO champion-id field to validate: the
 * counterpart body is read from the champion doc's own
 * `transform.counterpartId` (already a hard `zRef<ChampionId>("champions")`
 * in schema/champion.ts), so the reference is checked exactly once, where the
 * w3x actually declares it, and an ability doc cannot name a body that its
 * hero has no link to.
 */
z
  .object({
    kind: z.literal("championForm"),
    ...EFFECT_COMMON_SHAPE,
    /** "alternate"/"base" force a direction; "toggle" is the w3x 風王結界/紮根 form */
    to: z.enum(["alternate", "base", "toggle"]),
    /**
     * w3a `ahdu` at the cast rank; ABSENT = never times out (the toggles).
     *
     * ⭐ G2（GH#299）—— 逐階可以是陣列。w3a 的 `ahdu` 本來就是**一階一格**，
     * 而在此之前這裡只收一個數字，於是 77-03 出現「rank 4 的加速活 15 秒、
     * 翅膀只有 6 秒」這種兩半各走各的。
     */
    durationSec: zRankScalar(z.number().positive()).optional(),
  })
  .strict();

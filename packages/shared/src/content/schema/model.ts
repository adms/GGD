/**
 * model@1 — voxel model metadata. Maps a `modelKey` (referenced from
 * champion.modelKey) to a Blockbench-exported .glb under content/assets/**,
 * plus the animation clip map, attach points, and team-tint materials the
 * client's AnimationStateMachine / EntityView need.
 */
import { z } from "zod";
import { zId } from "./common";

export const zClipMap = z
  .object({
    idle: z.string().min(1),
    run: z.string().min(1),
    attack: z.string().min(1),
    cast: z.string().min(1),
    hurt: z.string().min(1),
    death: z.string().min(1),
  })
  .strict();

export const zModelDoc = z
  .object({
    id: zId,
    schema: z.literal("model@1"),
    /** path relative to content/ root; binaries live under assets/** */
    glbPath: z
      .string()
      .min(1)
      .regex(/^assets\//, "glbPath must be relative to content/ and start with assets/"),
    scale: z.number().positive(),
    /** planar collision radius the sim uses for this model's champion */
    collisionRadius: z.number().positive(),
    /** logical state -> AnimationGroup clip name inside the .glb */
    clipMap: zClipMap,
    /** named local-space offsets for vfx/projectile muzzles, overhead UI, … */
    attachPoints: z
      .record(
        z.string().min(1),
        z.object({ x: z.number(), y: z.number(), z: z.number() }).strict(),
      )
      .optional(),
    /** material names that get re-tinted to the owning team's color */
    teamTintMaterials: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type ModelDoc = z.infer<typeof zModelDoc>;

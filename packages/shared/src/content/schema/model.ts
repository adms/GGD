/**
 * model@1 — voxel model metadata. Maps a `modelKey` (referenced from
 * champion.modelKey) to a Blockbench-exported .glb under content/assets/**,
 * plus the animation clip map, attach points, and team-tint materials the
 * client's AnimationStateMachine / EntityView need.
 */
import { z } from "zod";
import { zId } from "./common";
import { zVoxelLook } from "../../voxel/look";

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
    /**
     * The generator parameters this model was authored from (task #229's
     * 鑄形工坊 / #226's blocky-humanoid bake). PRESENT ⇒ the .glb at `glbPath`
     * is produced by `pnpm voxel:gen` from these numbers and must not be
     * hand-edited; ABSENT ⇒ the model is an imported/hand-authored mesh and
     * the bake leaves it alone.
     *
     * ADDITIVE AND OPTIONAL ON PURPOSE. `glbPath` stays required and the
     * object stays `.strict()`, so all 121 existing `content/models/*.json`
     * documents remain valid unchanged, and a generated model is still an
     * ordinary model@1 that champions reference by `modelKey` exactly as today.
     */
    voxel: zVoxelLook.optional(),
    /**
     * Yaw correction (DEGREES, CCW about +Y) applied to this model's glbRoot so
     * its rendered facing matches the sim's. ABSENT ⇒ the family default for
     * `glbPath` (see apps/client/src/render/views/glbFacing.ts).
     *
     * WHY THIS IS CONTENT AND NOT A CONSTANT (CLAUDE.md 第一守則).
     * It used to be `FLIPPED_IMPORTED_MODEL_KEYS`, a hardcoded Set in client
     * code, which meant a mis-baked model could only be corrected by editing
     * TypeScript and rebuilding + redeploying the client image. `content/` is a
     * live bind-mount, so as a doc field the same correction is a file edit.
     * That matters because the set was demonstrably INCOMPLETE — measuring the
     * shipped geometry found `imported.linkstik` 180° off and unlisted (see
     * modelFacing.test.ts, which re-derives every value from the .glb itself).
     *
     * It also fixes a hole the Set could not express at all: it was keyed by
     * `modelKey`, but the 40 Blizzard-overlay champions all share a stand-in
     * modelKey (`champ.sela`/`champ.skin.*`), so one entry would have rotated
     * ~18 unrelated champions. Keyed to the model DOC, one doc = one mesh.
     *
     * Range is ±360 so an author can write 270 or -90 for the same rotation.
     */
    yawOffsetDeg: z.number().gte(-360).lte(360).optional(),
  })
  .strict();

export type ModelDoc = z.infer<typeof zModelDoc>;

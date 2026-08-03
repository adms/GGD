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
    /**
     * glTF `mesh.primitives[i]` indices this model must NOT draw. ABSENT/empty
     * ⇒ draw everything (today's behaviour for all 124 shipped model docs).
     *
     * WHY THIS EXISTS — 「3d model 連著屍體一起」(owner 2026-08-02, 初號機 +
     * 拳四郎). Warcraft III unit models carry a `gutz*` GORE geoset: the pool of
     * blood/entrails the corpse leaves behind. WC3 keeps it invisible until the
     * decay sequence by animating the geoset's alpha (GEOA/KGAO) — and #59
     * established that the mdx→glb converter DROPS geoset visibility animation,
     * so every one of those geosets converts to a permanently-visible primitive.
     * Measured on `data/blizzard-overlay/models/` (see the census tool below):
     * 16 of the 40 extracted unit models ship one, and it is not subtle —
     * `E00R.glb`'s is a flat slab spanning x −0.03…1.64 at y 0.12…0.26 on a body
     * only ~1.7u tall, i.e. a corpse-sized splat lying on the floor beside the
     * champion. `Umal.glb` additionally carries a whole SECOND animated skeleton
     * (`Bone_Root01`, 107 verts) standing ~1.2u away in +Z, driven by all 13
     * clips — it walks, attacks and dies with you.
     *
     * WHY IT IS AN INDEX LIST AND NOT A JOINT-NAME LIST.
     * The obvious spelling is "hide the subtree under joint `gutz00`", but that
     * cannot be implemented in the render layer: the gore is SKINNED geometry
     * inside a shared mesh, so disabling a bone's TransformNode moves nothing —
     * the vertices follow the bone matrices regardless. Hiding has to happen at
     * the drawable, and the drawable is the primitive. A field whose value the
     * renderer silently cannot honour is failure form ② (計算了但從沒送到畫面),
     * so the joint analysis stays in the offline tool where it can actually run
     * (tools/w3x-import/gore_geoset_census.py resolves joint roots → indices)
     * and the doc records the answer.
     *
     * THE COST OF INDICES IS DRIFT — a re-extraction can renumber them, and a
     * wrong index either misses (gore returns) or hits the body (champion
     * vanishes). That is exactly why the census is committed as a fixture and
     * `apps/client/src/render/views/hiddenPrimitives.test.ts` re-derives every
     * declared index from the real .glb bytes: drift goes red, it does not rot.
     *
     * Bounded both ways (CLAUDE.md 第一守則): a glTF mesh with >256 primitives
     * is not a champion body, and 32 hidden primitives is already far more than
     * the worst measured model needs (2, `Ekee.glb`).
     */
    hiddenPrimitives: z.array(z.number().int().gte(0).lte(255)).max(32).optional(),
  })
  .strict();

export type ModelDoc = z.infer<typeof zModelDoc>;

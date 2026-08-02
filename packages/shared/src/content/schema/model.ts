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
     * 這一份模型的烘焙朝向修正（度）。缺 = 不修正。
     *
     * ⚠️ 鍵在**模型文件**上而不是 `modelKey`：40 隻 Blizzard-overlay 英雄共用
     * 同一個替身 modelKey（`champ.sela` / `champ.skin.*`），鍵在 modelKey 上的話
     * 一筆設定會轉到 ~18 隻不相干的英雄。一份 doc = 一個網格。
     * 範圍 ±360，所以 270 與 -90 兩種寫法都可以。
     *
     * ⚠️ 2026-08-02：這一格沒跟出貨 bundle 同時進版，造成線上內容驗證失敗、
     * 退回 2 隻骨架英雄。**commit 一個檔之前要確認它依賴的定義都在版控裡。**
     */
    yawOffsetDeg: z.number().gte(-360).lte(360).optional(),
  })
  .strict();

export type ModelDoc = z.infer<typeof zModelDoc>;

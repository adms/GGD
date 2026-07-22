/** projectile@1 — mirrors `ProjectileDef` in sim/content/defs.ts. */
import { z } from "zod";
import type { ProjectileId } from "../../ids";
import { zIdFor, zRef } from "./common";

export const zProjectileDef = z
  .object({
    id: zIdFor<ProjectileId>(),
    speed: z.number().positive(),
    maxRange: z.number().positive(),
    hitRadius: z.number().positive(),
    pierce: z.boolean().optional(),
    vfxKey: zRef("vfx", { soft: true }).optional(),
    /**
     * RENDER-ONLY (never read by the sim): the 3D body the client builds for
     * the flying projectile, under the particle trail. Omitted → "bolt".
     * A missile that is only a billboard sprite reads as a flat decal from the
     * fixed camera; a real oriented mesh is what makes a ranged auto read as a
     * projectile travelling toward its victim.
     */
    meshShape: z.enum(["bolt", "orb", "shard"]).optional(),
  })
  .strict();

export const zProjectileDoc = zProjectileDef
  .extend({ schema: z.literal("projectile@1") })
  .strict();

export type ProjectileDoc = z.infer<typeof zProjectileDoc>;

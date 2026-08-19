import { z } from "zod";
import type { ProjectileId } from "../../../ids";
import { zRef } from "../common";
import {
  EFFECT_COMMON_SHAPE,
  zEffectDef,
} from "./_shared";

export const zSpawnProjectile =
z
  .object({
    kind: z.literal("spawnProjectile"),
    ...EFFECT_COMMON_SHAPE,
    projectileId: zRef<ProjectileId>("projectiles"),
    onHit: z.array(z.lazy(() => zEffectDef)),
  })
  .strict();

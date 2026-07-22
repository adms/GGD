/** arena@1 — mirrors `ArenaDef` in sim/world/ArenaDef.ts. */
import { z } from "zod";
import { zId, zVec2 } from "./common";

export const zObstacle = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("circle"), center: zVec2, radius: z.number().positive() }).strict(),
  z.object({ kind: z.literal("segment"), a: zVec2, b: zVec2 }).strict(),
]);

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

export const zZoneDef = z
  .object({
    id: z.string().min(1),
    /** Zone is a circular arena: units are clamped inside boundary. */
    center: zVec2,
    boundaryRadius: z.number().positive(),
    obstacles: z.array(zObstacle),
    /** Spawn points, indexed by side (0/1) then slot (0..2). */
    spawns: z.tuple([z.array(zVec2).min(1), z.array(zVec2).min(1)]),
  })
  .strict()
  // Gameplay truth is `obstacles` + `spawns`: they must sit inside the circular
  // boundary or units get clamped onto/through them. (Decor is visual-only and
  // deliberately NOT checked — props may overhang the rim for framing.)
  .superRefine((zone, ctx) => {
    zone.obstacles.forEach((ob, i) => {
      const inside =
        ob.kind === "circle"
          ? dist(ob.center, zone.center) + ob.radius <= zone.boundaryRadius + 1e-6
          : dist(ob.a, zone.center) <= zone.boundaryRadius + 1e-6 &&
            dist(ob.b, zone.center) <= zone.boundaryRadius + 1e-6;
      if (!inside) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["obstacles", i],
          message: `obstacle ${i} escapes zone "${zone.id}" boundary (r=${zone.boundaryRadius})`,
        });
      }
    });
    zone.spawns.forEach((side, si) => {
      side.forEach((s, pi) => {
        if (dist(s, zone.center) > zone.boundaryRadius + 1e-6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["spawns", si, pi],
            message: `spawn ${si}/${pi} is outside zone "${zone.id}" boundary`,
          });
        }
      });
    });
  });

/**
 * Purely-visual decoration: a prop model placed on the ground plane. The sim
 * NEVER reads this — collision stays defined by `obstacles`. Editable data so
 * the arena's look is authored in the editor without touching gameplay.
 */
export const zDecor = z
  .object({
    /** path under content/, e.g. "assets/models/props/pillar.glb" */
    model: z.string().regex(/^assets\//),
    x: z.number(),
    z: z.number(),
    /** rotation around Y in quarter-turns (0-3) — avoids radians in data */
    rotQuarter: z.number().int().min(0).max(3).default(0),
    scale: z.number().positive().default(1),
  })
  .strict();

export const zArenaDef = z
  .object({
    id: zId,
    name: z.string().min(1),
    zones: z.array(zZoneDef).min(1),
    /** visual-only props (client renders; sim ignores) */
    decor: z.array(zDecor).default([]),
    /** ground texture/tile hint for the client (visual only) */
    groundStyle: z.enum(["stone", "dirt", "wood", "grass", "sand"]).default("stone"),
  })
  .strict();

export const zArenaDoc = zArenaDef.extend({ schema: z.literal("arena@1") }).strict();

export type ArenaDoc = z.infer<typeof zArenaDoc>;
export type DecorDef = z.infer<typeof zDecor>;

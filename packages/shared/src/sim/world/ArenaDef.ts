/**
 * Arena definition — the planar collision content of a map. Two zones for
 * PairedDuels (each duel is confined to its own zone). Pure data; authored via
 * the map editor and validated by the content pipeline.
 */
import type { Vec2 } from "../math/vec2";

/** A circular blocking obstacle (pillar). */
export interface ObstacleCircle {
  kind: "circle";
  center: Vec2;
  radius: number;
}

/** A blocking wall segment. */
export interface ObstacleSegment {
  kind: "segment";
  a: Vec2;
  b: Vec2;
}

export type Obstacle = ObstacleCircle | ObstacleSegment;

export interface ZoneDef {
  id: string;
  /** Zone is a circular arena: units are clamped inside boundary. */
  center: Vec2;
  boundaryRadius: number;
  obstacles: Obstacle[];
  /** Spawn points, indexed by side (0/1) then slot (0..2). */
  spawns: [Vec2[], Vec2[]];
}

export interface ArenaDef {
  id: string;
  name: string;
  zones: ZoneDef[];
}

/**
 * Derive the sim's `ArenaDef` (collision truth) from a loaded `arena@1` doc.
 * An `ArenaDoc` is a superset of `ArenaDef` — the extra `decor`/`groundStyle`/
 * `schema` fields are visual-only and dropped here, so the server collides
 * against exactly the zones/obstacles/spawns the doc declares. Kept in shared
 * so BOTH the game-server (authoritative) and the client (rendering) build the
 * same geometry from the same doc.
 */
export function arenaDefFromDoc(doc: {
  id: string;
  name: string;
  zones: ZoneDef[];
}): ArenaDef {
  return {
    id: doc.id,
    name: doc.name,
    zones: doc.zones.map((z) => ({
      id: z.id,
      center: { x: z.center.x, z: z.center.z },
      boundaryRadius: z.boundaryRadius,
      obstacles: z.obstacles.map((o) =>
        o.kind === "circle"
          ? { kind: "circle" as const, center: { x: o.center.x, z: o.center.z }, radius: o.radius }
          : { kind: "segment" as const, a: { x: o.a.x, z: o.a.z }, b: { x: o.b.x, z: o.b.z } },
      ),
      spawns: [z.spawns[0].map((s) => ({ x: s.x, z: s.z })), z.spawns[1].map((s) => ({ x: s.x, z: s.z }))] as [
        Vec2[],
        Vec2[],
      ],
    })),
  };
}

/** Built-in skeleton arena: two circular zones with a pillar each. */
export const SKELETON_ARENA: ArenaDef = {
  id: "arena.skeleton",
  name: "Skeleton Arena",
  zones: [0, 1].map((i) => {
    const cx = i === 0 ? -40 : 40;
    return {
      id: `zone-${i}`,
      center: { x: cx, z: 0 },
      boundaryRadius: 24,
      obstacles: [
        { kind: "circle" as const, center: { x: cx, z: 0 }, radius: 2.5 },
        { kind: "circle" as const, center: { x: cx - 9, z: 8 }, radius: 1.8 },
        { kind: "circle" as const, center: { x: cx + 9, z: -8 }, radius: 1.8 },
      ],
      spawns: [
        [
          { x: cx - 16, z: -4 },
          { x: cx - 16, z: 0 },
          { x: cx - 16, z: 4 },
        ],
        [
          { x: cx + 16, z: -4 },
          { x: cx + 16, z: 0 },
          { x: cx + 16, z: 4 },
        ],
      ] as [Vec2[], Vec2[]],
    };
  }),
};

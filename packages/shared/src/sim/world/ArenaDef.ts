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

/**
 * 32-bit integer avalanche hash (splitmix-style finalizer). Pure, platform-stable
 * (integer ops + Math.imul only — no float, no trig), and NOT sourced from
 * `world.rng`, so hashing (seed, round) to pick an arena never advances the sim's
 * random stream. That independence is what keeps a same-seed replay byte-identical
 * (task #145).
 */
function hash32(x: number): number {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h >>> 0;
}

/**
 * A deterministic permutation of `[0, size)` derived purely from `matchSeed`
 * (seeded Fisher–Yates). The order is fixed for the whole match, so the arena
 * rotation is reproducible from the seed alone; walking it cyclically (see
 * {@link pickRoundArena}) makes consecutive rounds ALWAYS differ and the first
 * `size` rounds cover every arena — maximal variety, which is the point of #145.
 */
export function arenaRotationOrder(size: number, matchSeed: number): number[] {
  const order = Array.from({ length: size }, (_, i) => i);
  let s = hash32(matchSeed);
  for (let i = size - 1; i > 0; i--) {
    // advance the local hash stream (independent of world.rng) and draw 0..i
    s = hash32(s + 0x6d2b79f5);
    const r = s % (i + 1);
    const tmp = order[i]!;
    order[i] = order[r]!;
    order[r] = tmp;
  }
  return order;
}

/**
 * Pick the arena for a given combat `round`, DETERMINISTICALLY, from a pool —
 * server-authoritative and reproducible from `(matchSeed, round)` alone (task
 * #145: 每回合隨機換地圖). Uses a seed-derived permutation walked cyclically, so:
 *   • the choice is a pure function of the seed and round (stable WITHIN a round,
 *     identical under same-seed replay),
 *   • consecutive rounds never land on the same arena (pool size ≥ 2),
 *   • it consumes no `world.rng`, so it perturbs no other randomness.
 * Returns null only for an empty pool (caller keeps its current arena).
 */
export function pickRoundArena<T extends { id: string }>(
  pool: readonly T[],
  matchSeed: number,
  round: number,
): T | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0]!;
  const order = arenaRotationOrder(pool.length, matchSeed);
  // round is 1-based in a live match; the modulo is non-negative for any round ≥ 0.
  const idx = order[((round % order.length) + order.length) % order.length]!;
  return pool[idx]!;
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

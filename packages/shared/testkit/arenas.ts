/**
 * Frozen arena fixtures for tests.
 *
 * Task #218 deleted the CENTRE pillar from every shipped arena (owner directive:
 * a blocker standing on the zone centre is exactly where the fight happens and
 * where the neutral guardian already stands, so it fought both the camera and
 * the walk). That was a CONTENT change, but several tests had quietly adopted
 * the shipped `SKELETON_ARENA` as their fixture:
 *
 *   • the pathing tests needed *a* blocker to walk around — any blocker;
 *   • the #191 coin no-op golden needed *stable* geometry — the digest is a hash
 *     over positions, so it moves whenever the arena does, which says nothing
 *     about whether coin arming stayed a no-op.
 *
 * Neither actually wanted "whatever the shipped map currently is". `PILLAR_ARENA`
 * below is the pre-#218 skeleton arena, byte-for-byte (obstacle ORDER included —
 * collision resolves in array order, so the order is part of the digest). Tests
 * that need a pillar or a frozen hash use this; tests that assert on the real
 * shipped geometry keep importing `SKELETON_ARENA`.
 */
import { SKELETON_ARENA, type ArenaDef } from "../src/sim/world/ArenaDef";

/** The skeleton arena as it stood BEFORE #218 removed the centre pillar. */
export const PILLAR_ARENA: ArenaDef = {
  ...SKELETON_ARENA,
  zones: SKELETON_ARENA.zones.map((z) => ({
    ...z,
    obstacles: [
      // centre pillar FIRST — the pre-#218 order, which the golden digest encodes
      { kind: "circle" as const, center: { x: z.center.x, z: z.center.z }, radius: 2.5 },
      ...z.obstacles,
    ],
  })),
};

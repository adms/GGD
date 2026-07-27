/**
 * The FINALE MAP, pinned end-to-end (owner 2026-07-27, rule D:
 * 「用現有的 zone，只把半徑放大…出生點改成環狀均分」).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL — the failure it is built to catch
 * ---------------------------------------------------------------------------
 * The obvious way to "enlarge the zone" is to scale `boundaryRadius` on the
 * ArenaDef the server holds. That would have been invisible to every player:
 * the client never receives arena geometry over the wire. `GameApp.applyArena`
 * takes the `mapId` the snapshot broadcasts, FETCHES THE ARENA DOC by that id,
 * and builds the ground disc, the minimap terrain bake and the fire-ring band
 * from the doc. A server-only radius change moves the collision boundary to 42
 * while every client still draws 24 — champions walk on nothing and the ring is
 * read against the wrong circle.
 *
 * So the finale is a REAL content doc, and this file pins the three things that
 * make it reach a player:
 *   1. `content/arenas/arena.royale.json` EXISTS and is schema-valid, so
 *      `contentDb.loadArena("arena.royale")` on the client resolves;
 *   2. it matches the built-in {@link ROYALE_ARENA} field-for-field, so the
 *      no-content fallback the server uses in tests is the same arena players
 *      get in a real match (otherwise every test below would be measuring
 *      geometry nobody plays);
 *   3. the layout is actually playable by twelve: 12 spawn points, four
 *      equidistant clusters, teammates together, nobody overlapping, nobody
 *      outside the rim.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { zArenaDoc } from "@ggd/shared/content";
import {
  ROYALE_ARENA,
  ROYALE_SPAWNS,
  ROYALE_SPAWN_RING,
  ROYALE_TEAM_SLOTS,
  ROYALE_ZONE_RADIUS,
  arenaDefFromDoc,
  royaleSpawnAt,
} from "@ggd/shared/sim/world/ArenaDef";
import { ARENA_ROTATION_IDS, resolveArenaPool, resolveRoyaleArena } from "./arenaSelect";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const SHIPPED = zArenaDoc.parse(
  JSON.parse(readFileSync(join(CONTENT, "arenas", "arena.royale.json"), "utf8")),
);

/** champion collision radius (spawnChampion.ts) — the "does anyone clip" unit */
const BODY_RADIUS = 0.6;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);

describe("the finale map SHIPS as content, not as a runtime resize (royale-arena-doc)", () => {
  it("content/arenas/arena.royale.json exists, is schema-valid, and is ONE big zone", () => {
    cover("royale-arena-doc");
    expect(SHIPPED.id).toBe("arena.royale");
    expect(SHIPPED.zones).toHaveLength(1); // 大混戰 = one field, not two duel pits
    expect(SHIPPED.zones[0]!.boundaryRadius).toBe(ROYALE_ZONE_RADIUS);
    // …and genuinely bigger than a duel zone (24), which is the whole of rule D
    expect(SHIPPED.zones[0]!.boundaryRadius).toBeGreaterThan(24);
  });

  it("the shipped doc and the built-in fallback are the SAME arena", () => {
    cover("royale-arena-doc");
    // If these drift, every controller test below is exercising geometry the
    // player never sees — the exact "測的主體不是真的那個東西" failure mode.
    const fromDoc = arenaDefFromDoc(SHIPPED);
    expect(fromDoc.id).toBe(ROYALE_ARENA.id);
    expect(JSON.stringify(fromDoc.zones)).toBe(JSON.stringify(ROYALE_ARENA.zones));
    // and the resolver hands back the doc-derived arena when content is loaded,
    // the constant when it is not — both with the id the client fetches by.
    expect(resolveRoyaleArena().id).toBe("arena.royale");
  });

  it("is EXCLUDED from the per-round rotation, so rounds 1-9 never land on it", () => {
    cover("royale-arena-doc");
    expect(ARENA_ROTATION_IDS).not.toContain("arena.royale");
    expect(resolveArenaPool().map((a) => a.id)).not.toContain("arena.royale");
  });
});

describe("twelve champions fit, in four equidistant clusters (royale-arena-spawns)", () => {
  const zone = arenaDefFromDoc(SHIPPED).zones[0]!;
  const flat = [...zone.spawns[0], ...zone.spawns[1]];

  it("offers at least 12 spawn points, all inside the rim", () => {
    cover("royale-arena-spawns");
    expect(flat.length).toBeGreaterThanOrEqual(12);
    for (const s of flat) {
      // WHOLE BODY inside, not just the centre point — a champion spawned with
      // its edge past the boundary is clamped on its first movement tick.
      expect(dist(s, zone.center)).toBeLessThanOrEqual(zone.boundaryRadius - BODY_RADIUS);
    }
    // the packed 2-tuple decodes back to the documented grouped order
    for (let g = 0; g < ROYALE_TEAM_SLOTS; g++) {
      for (let s = 0; s < 3; s++) {
        expect(royaleSpawnAt(zone, g, s)).toEqual(ROYALE_SPAWNS[g * 3 + s]);
      }
    }
  });

  it("keeps teammates together and the four teams far apart", () => {
    cover("royale-arena-spawns");
    const groups = [0, 1, 2, 3].map((g) => [0, 1, 2].map((s) => royaleSpawnAt(zone, g, s)));
    // TEAMMATES TOGETHER: every pair inside a cluster is within one 「一組」 span
    for (const g of groups) {
      for (const a of g) for (const b of g) expect(dist(a, b)).toBeLessThanOrEqual(9);
    }
    // FOUR TEAMS PULLED APART: any cross-team pair is further than any in-team
    // pair, by a wide margin — nobody starts in an enemy's lap.
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        for (const a of groups[i]!) for (const b of groups[j]!) expect(dist(a, b)).toBeGreaterThan(20);
      }
    }
    // 環狀均分, stated exactly: the four clusters are ROTATIONS of one another
    // about the centre, so slot s of every team sits at the identical radius.
    // (Asserting one shared number for all twelve would be wrong — the middle of
    // a cluster is on the ring at 30, its two flankers a touch further out.)
    for (let s = 0; s < 3; s++) {
      const radii = groups.map((g) => dist(g[s]!, zone.center));
      for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 9);
    }
    // …and the ring itself is where the constant says it is
    expect(dist(groups[0]![1]!, zone.center)).toBeCloseTo(ROYALE_SPAWN_RING, 9);
  });

  it("nobody overlaps anybody, and no obstacle sits on a spawn or on the centre", () => {
    cover("royale-arena-spawns");
    for (let i = 0; i < flat.length; i++) {
      for (let j = i + 1; j < flat.length; j++) {
        // two bodies of radius 0.6 need >1.2 between centres to not interpenetrate
        expect(dist(flat[i]!, flat[j]!)).toBeGreaterThan(BODY_RADIUS * 2);
      }
    }
    for (const ob of zone.obstacles) {
      expect(ob.kind).toBe("circle");
      if (ob.kind !== "circle") continue;
      // #218's rule: nothing on the zone centre (the guardian stands there and
      // it is where the fight converges as the ring closes)
      expect(dist(ob.center, zone.center)).toBeGreaterThan(ob.radius + 2);
      for (const s of flat) expect(dist(ob.center, s)).toBeGreaterThan(ob.radius + BODY_RADIUS);
    }
  });
});

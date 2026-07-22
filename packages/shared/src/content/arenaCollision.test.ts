import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { zArenaDoc, zArenaDef } from "./schema/arena";
import { auditArenaCollision, classifyModel, circleObstacleForDecor } from "./arenaCollision";

const miniZone = {
  id: "z0",
  center: { x: 0, z: 0 },
  boundaryRadius: 24,
  obstacles: [],
  spawns: [[{ x: -10, z: 0 }], [{ x: 10, z: 0 }]],
};

describe("arena groundStyle enum (arena-groundstyle)", () => {
  it("accepts grass and sand alongside the existing stone/dirt/wood", () => {
    cover("arena-groundstyle-enum");
    for (const groundStyle of ["stone", "dirt", "wood", "grass", "sand"] as const) {
      const r = zArenaDef.safeParse({ id: "arena.x", name: "X", zones: [miniZone], groundStyle });
      expect(r.success, groundStyle).toBe(true);
    }
    // unknown styles still rejected
    expect(zArenaDef.safeParse({ id: "arena.x", name: "X", zones: [miniZone], groundStyle: "lava" }).success).toBe(false);
  });
});

const ARENA_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/arenas");
const arenaFiles = readdirSync(ARENA_DIR).filter((f) => f.startsWith("arena.") && f.endsWith(".json"));

describe("arena collision completeness (arena-collision)", () => {
  it("classifies decor: trees/pillars/crates/towers/rocks block; flavor does not", () => {
    cover("arena-collision-rule");
    // blocking
    for (const m of [
      "assets/models/props/pillar.glb",
      "assets/models/hex/tree_single.glb",
      "assets/models/hex/trees_medium.glb",
      "assets/models/hex/tower_blue.glb",
      "assets/models/hex/rock.glb",
      "assets/models/props/crates_stacked.glb",
      "assets/models/props/chest.glb",
      "assets/models/props/barrel_small.glb",
      "assets/models/imported/japanesecherry.glb",
    ]) {
      expect(classifyModel(m).blocking, m).toBe(true);
    }
    // trees use a small TRUNK footprint (not canopy) → keeps jungles walkable
    expect(classifyModel("assets/models/hex/tree_single.glb").base).toBeLessThan(0.5);
    // non-blocking flavor
    for (const m of [
      "assets/models/props/torch.glb",
      "assets/models/props/torch_mounted.glb",
      "assets/models/props/banner_shield_blue.glb",
      "assets/models/props/floor_tile_large.glb",
      "assets/models/hex/hex_water.glb",
      "assets/models/hex/hex_grass.glb",
      "assets/models/hex/waterlily.glb",
    ]) {
      expect(classifyModel(m).blocking, m).toBe(false);
    }
  });

  it("derives an in-boundary obstacle for a blocking prop, none for flavor/backdrop", () => {
    cover("arena-collision-derive");
    const zone = { center: { x: 0, z: 0 }, boundaryRadius: 24 };
    const pillar = circleObstacleForDecor({ model: "props/pillar.glb", x: 5, z: 0, scale: 2 }, zone);
    expect(pillar).not.toBeNull();
    expect(pillar!.radius).toBeGreaterThan(0);
    // flavor → no obstacle
    expect(circleObstacleForDecor({ model: "props/torch.glb", x: 5, z: 0, scale: 1 }, zone)).toBeNull();
    // outside the play area → no obstacle needed
    expect(circleObstacleForDecor({ model: "props/pillar.glb", x: 99, z: 0, scale: 1 }, zone)).toBeNull();
  });

  it("EVERY arena doc: every in-bounds blocking prop has a matching collision obstacle", () => {
    cover("arena-collision-complete");
    expect(arenaFiles.length).toBeGreaterThanOrEqual(5);
    for (const f of arenaFiles) {
      const doc = zArenaDoc.parse(JSON.parse(readFileSync(join(ARENA_DIR, f), "utf8")));
      const audit = auditArenaCollision(doc);
      // report is empty ⇒ no walk-through props
      expect(audit.gaps, `${f} collision gaps: ${JSON.stringify(audit.gaps)}`).toEqual([]);
      // and it actually checked some blocking props (guards against a no-op audit)
      expect(audit.checked, f).toBeGreaterThan(0);
    }
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { zArenaDoc, zArenaDef } from "./schema/arena";
import { GROUND_STYLE_IDS } from "./schema/groundStyle";
import { auditArenaCollision, classifyModel, circleObstacleForDecor } from "./arenaCollision";

const miniZone = {
  id: "z0",
  center: { x: 0, z: 0 },
  boundaryRadius: 24,
  obstacles: [],
  spawns: [[{ x: -10, z: 0 }], [{ x: 10, z: 0 }]],
};

describe("arena groundStyle enum (arena-groundstyle)", () => {
  it("accepts EVERY id the single source of truth declares", () => {
    cover("arena-groundstyle-enum");
    // ⭐ GH#342 —— ⛔ 這裡刻意**不**抄一份字面清單。名字只住在
    // `./schema/groundStyle.ts`，`arena@1` 要收得下它宣告的每一個 ——
    // 收不下的那一個，就是一張編出來會被自己的 schema 拒收的場地。
    for (const groundStyle of GROUND_STYLE_IDS) {
      const r = zArenaDef.safeParse({ id: "arena.x", name: "X", zones: [miniZone], groundStyle });
      expect(
        r.success,
        `arena@1 收不下 "${groundStyle}" —— 把 schema/arena.ts 的 groundStyle 改成 z.enum(GROUND_STYLE_IDS)`,
      ).toBe(true);
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
    let totalChecked = 0;
    for (const f of arenaFiles) {
      const doc = zArenaDoc.parse(JSON.parse(readFileSync(join(ARENA_DIR, f), "utf8")));
      const audit = auditArenaCollision(doc);
      // report is empty ⇒ no walk-through props (every blocking prop is covered)
      expect(audit.gaps, `${f} collision gaps: ${JSON.stringify(audit.gaps)}`).toEqual([]);
      totalChecked += audit.checked;
    }
    // GLOBAL no-op guard: an arena is ALLOWED to have zero blocking props —
    // skeleton is now an open arena after its central pillars were removed
    // (「中央有大柱子，容易卡到其他場景物件」) — so the "matcher actually detected
    // props" guard is asserted across the whole set, not per-arena. The unit
    // test above already proves circleObstacleForDecor detects a pillar.
    expect(totalChecked, "no arena had any blocking prop — the matcher may be a no-op").toBeGreaterThan(0);
  });
});

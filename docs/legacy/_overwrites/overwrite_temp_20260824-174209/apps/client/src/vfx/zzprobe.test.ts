import { describe, it, expect, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));

import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VfxSystem } from "./VfxSystem";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { castAbility } from "@ggd/shared/sim/abilities/abilitySystem";
import { asSeatId, asTeamId } from "@ggd/shared/ids";
import { isFannedOutEvent } from "../../../game-server/src/net/eventFanout";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;

function arcMeshes(scene: Scene): number {
  let n = 0;
  for (const m of scene.meshes) {
    if (!m.name.startsWith("vfx-arc") || !m.isEnabled()) continue;
    const p = m.getVerticesData(VertexBuffer.PositionKind);
    if (p && p.length > 0) n++;
  }
  return n;
}

describe("probe e2e", () => {
  it("real sim → fanout → client draws arc", async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);

    const world = new SimWorld(SKELETON_ARENA, 4242);
    world.combatActive = true;
    const caster = spawnChampion(world, {
      championId: "godie-udea", seatId: asSeatId(0), teamId: asTeamId(0),
      pos: { x: C.x, z: C.z }, zone: 0, level: 9,
    } as never);
    for (let i = 0; i < 6; i++) {
      spawnChampion(world, {
        championId: "godie-e001", seatId: asSeatId(i + 1), teamId: asTeamId(1),
        pos: { x: C.x + 1.5 + i * 1.2, z: C.z + (i % 2 ? 1 : -1) }, zone: 0, level: 9,
      } as never);
    }
    world.rebuildGrid();
    world.abilities.get(caster)!.slots.R.rank = 1;
    expect(castAbility(world, caster, "R", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok");

    // ---- LOCKSTEP: sim tick → shipped fanout → shipped client → update() ----
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const fx = new VfxSystem(scene, { entityPos: () => null });
    let now = 1000;
    let framesWithLitArc = 0;
    let totalCl = 0;
    let peakLit = 0;
    for (let t = 0; t < 90; t++) {
      world.step(new Map());
      for (const ev of world.events) {
        if (!isFannedOutEvent(ev)) continue;
        if (ev.type === "chainLightning") totalCl++;
        fx.handleEvent({ type: ev.type, tick: ev.tick, data: ev.data } as never, now);
      }
      // 33.3 ms per sim tick; the client renders and ages the arcs.
      now += 1000 / 30;
      fx.update(now);
      let lit = 0;
      for (const m of scene.meshes) {
        if (!m.name.startsWith("vfx-arc") || !m.isEnabled() || !m.isVisible) continue;
        const mat = m.material as unknown as { alpha?: number } | null;
        if (!mat || !(mat.alpha! > 0)) continue;
        const p2 = m.getVerticesData(VertexBuffer.PositionKind);
        if (p2 && p2.length > 0) lit++;
      }
      if (lit > 0) framesWithLitArc++;
      peakLit = Math.max(peakLit, lit);
    }
    console.log("chainLightning events:", totalCl);
    console.log("frames (of 90) with a LIT arc on screen:", framesWithLitArc);
    console.log("peak simultaneous lit arcs:", peakLit);
    expect(totalCl).toBeGreaterThan(0);
    expect(framesWithLitArc).toBeGreaterThan(0);
    fx.dispose(); scene.dispose(); engine.dispose();
  }, 60000);
});

/** 探針（暫時）：同一支光束砲施放兩次，第二次的模型實例還在不在。 */
import { beforeAll, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ContentLoader } from "@ggd/shared/content/loader";
import { shippedContentSource } from "@ggd/shared/content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import type { EffectContext, EffectDef } from "@ggd/shared/sim/effects/effect";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "@ggd/shared/ids";
import { VfxSystem } from "../vfx/VfxSystem";
import { modelFxDocFor } from "./modelFxRig";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
const CASTER = "godie-ogrh" as ChampionId;
const SUBJECT = "godie-ogrh.r";

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

function castOnce(): EventMessage[] {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const caster = spawnChampion(world, {
    championId: CASTER, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0,
  });
  world.step(new Map());
  world.transform.get(caster)!.facing = { x: 1, z: 0 };
  const def = Abilities.tryGet(SUBJECT as AbilityId)!;
  runEffects((def.effects ?? []) as EffectDef[], {
    world, caster, rank: 1, targets: [], origin: `ability:${SUBJECT}`, rng: world.rng,
  } satisfies EffectContext);
  return world.events
    .filter((e) => e.type === "modelFxSpawn" || e.type === "vfxSpawn" || e.type === "vfxBurst")
    .map((e) => ({ type: e.type, tick: 0, data: e.data }) as unknown as EventMessage);
}

describe("探針：二次施放", () => {
  it("兩次施放各自的實例數與狀態", () => {
    const scene = new Scene(new NullEngine());
    const vfx = new VfxSystem(scene, {
      entityPos: () => null,
      modelDocFor: (k) => modelFxDocFor(Models.tryGet(k)),
      loadModelContainer: () => Promise.resolve(null),
    });
    const count = () => {
      const roots = scene.transformNodes.filter((n) => n.name.startsWith("modelfx-godie") || (n.name.startsWith("modelfx-") && !n.name.startsWith("modelfx-axis-")));
      return { total: roots.length, enabled: roots.filter((n) => n.isEnabled()).length };
    };
    // 第一次
    for (const ev of castOnce()) vfx.handleEvent(ev, 0);
    const c1 = count();
    console.log("CAST1", JSON.stringify(c1));
    // 推 3 秒（beam lifeSec 2）
    for (let t = 0; t < 30; t++) vfx.update((t + 1) * 100);
    console.log("AFTER_EXPIRE", JSON.stringify(count()));
    // 第二次
    for (const ev of castOnce()) vfx.handleEvent(ev, 3100);
    const c2 = count();
    console.log("CAST2", JSON.stringify(c2));
    expect(c2.enabled).toBe(c1.enabled);
    vfx.dispose();
  });
});

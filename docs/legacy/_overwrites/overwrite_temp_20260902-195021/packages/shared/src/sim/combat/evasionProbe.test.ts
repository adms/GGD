import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { ContentLoader } from "@ggd/shared/content/loader";
import { shippedContentSource } from "@ggd/shared/content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { evasionOf } from "@ggd/shared/sim/combat/evasion";
import { asSeatId, asTeamId, type ChampionId } from "@ggd/shared/ids";

const CONTENT = join(process.cwd(), "content");
beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

describe("probe", () => {
  it("who has evasion from a real source", () => {
    const C = SKELETON_ARENA.zones[0]!.center;
    for (const cid of ["godie-e00l", "godie-e002", "godie-u00j", "godie-hvsh", "godie-u00l", "godie-umal", "godie-h02k"]) {
      const w = new SimWorld(SKELETON_ARENA, 1);
      let id;
      try {
        id = spawnChampion(w, { championId: cid as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0 });
      } catch (e) { console.log(cid, "SPAWN FAIL", String(e).slice(0,120)); continue; }
      w.step(new Map());
      const sc = w.stats.get(id);
      const srcs = (sc?.sources ?? []).map((s) => ({ id: s.id, kind: s.kind, ev: (s.modifiers ?? []).filter((m) => m.stat === "evasion") }));
      console.log(cid, "final=", evasionOf(w, id), JSON.stringify(srcs.filter((s) => s.ev.length > 0)));
    }
    expect(true).toBe(true);
  });
});

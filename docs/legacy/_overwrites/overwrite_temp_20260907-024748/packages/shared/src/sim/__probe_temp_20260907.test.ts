import { describe, it, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { shippedContentSource } from "../content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import type { AbilityId } from "../ids";
const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});
describe("probe", () => {
  it("dump", () => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(Abilities.get("godie-hjai.e" as AbilityId).effects?.filter((e)=>e.kind==="spawnModelFx"), null, 1));
  });
});

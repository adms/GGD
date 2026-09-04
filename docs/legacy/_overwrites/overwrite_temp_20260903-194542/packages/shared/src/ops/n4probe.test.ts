import { describe, it, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const IDS = [
  "godie-hart.r", "godie-e002.ex", "godie-e00l.ex", "godie-hjai.w", "godie-hvsh.e",
  "godie-edem.ex", "godie-e00r.q", "godie-h02u.ex", "godie-e00l.passive",
  "godie-emns.passive", "godie-emns.ex",
];

describe("probe", () => {
  beforeAll(async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  });
  it("dump", () => {
    for (const id of IDS) {
      const def = Abilities.get(id as never) as unknown as Record<string, unknown> | undefined;
      if (!def) { console.log(`### ${id}  MISSING FROM REGISTRY`); continue; }
      console.log(`### ${id} cooldown=${JSON.stringify(def["cooldown"])} tier=${String(def["cooldownTier"])} shape=${String(def["cooldownShape"])} rangeTier=${String(def["rangeTier"])} radiusTier=${String(def["radiusTier"])} conditionTier=${String(def["conditionTier"])}`);
      console.log(`     effects=${JSON.stringify(def["effects"])}`.slice(0, 3000));
      if (def["passive"]) console.log(`     passive=${JSON.stringify(def["passive"])}`.slice(0, 2000));
      if (def["template"]) console.log(`     template=${JSON.stringify(def["template"])}`);
    }
  });
});

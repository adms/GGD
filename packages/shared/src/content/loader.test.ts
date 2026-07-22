/**
 * content-05 (content-loader-register): FsContentSource loads the generated
 * content/ tree, parses every doc, checks refs, and registers everything into
 * the sim + content registries — reproducing the TS-literal skeleton exactly.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import {
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
  registerAll,
} from "./registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "../sim/content/registry";
import { SELA, THORNE } from "../sim/content/skeleton";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import type { LoadResult } from "./loader";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

describe("ContentLoader + FsContentSource (content-05)", () => {
  let result: LoadResult;

  beforeAll(async () => {
    // this test file owns the registries (vitest isolates test files)
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
    registerAll(result.store);
  });

  it("loads and registers every collection from the JSON store", () => {
    cover("content-loader-register");
    expect(result.manifest.contentVersion).toMatch(/^cv_[0-9a-f]{12}$/);

    // sim registries — register/get API unchanged. The store also carries
    // imported WC3 content (godie-*/imported.* docs, tools/w3x-import), so
    // assert the skeleton set is present rather than an exact roster.
    expect(Champions.ids()).toEqual(expect.arrayContaining(["sela", "thorne"]));
    expect(Abilities.ids().length).toBeGreaterThanOrEqual(8);
    expect(Items.ids().length).toBeGreaterThanOrEqual(4);
    // augment pool = the skeleton 3 only (one per tier). The pseudo-EX draft
    // cards were removed — "EX 技能" is now a per-hero ability (champion.exAbility
    // + slot "EX"), NOT a generic augment draft. See ex-skills.test.ts.
    expect(Augments.ids()).toEqual(expect.arrayContaining(["bloodlust", "chill-touch", "aegis-surge"]));
    expect(Augments.ids().length).toBe(3);
    expect(Projectiles.ids().length).toBeGreaterThanOrEqual(2);
    expect(LootTables.get("round-reward").entries).toHaveLength(4);

    // content registries (new collections)
    expect(Arenas.get("arena.skeleton").zones).toHaveLength(2);
    expect(Configs.get("config.match").tick.tickHz).toBe(30);
    expect(Models.get("champ.sela").glbPath).toBe("assets/models/champions/mage.glb");
    expect(VfxDefs.ids().length).toBeGreaterThanOrEqual(2);
    expect(StatusEffects.ids().sort()).toEqual(["burnstun", "root", "slow25", "slow30", "slow40"]);
  });

  it("the JSON round-trip reproduces the TS literals exactly", () => {
    // registered defs came from JSON; they must match the sim's literals
    expect(Champions.get(SELA.id)).toMatchObject(JSON.parse(JSON.stringify(SELA)));
    expect(Champions.get(THORNE.id)).toMatchObject(JSON.parse(JSON.stringify(THORNE)));
    expect(Abilities.get(SELA.abilities.Q.id)).toMatchObject(
      JSON.parse(JSON.stringify(SELA.abilities.Q)),
    );
    expect(Arenas.get(SKELETON_ARENA.id)).toMatchObject(JSON.parse(JSON.stringify(SKELETON_ARENA)));
  });

  it("has zero hard-ref errors and reports soft warnings explicitly", () => {
    // the generated tree is fully closed: no dangles at all
    expect(result.warnings).toEqual([]);
  });
});

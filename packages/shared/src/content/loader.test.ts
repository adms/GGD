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
    // augment pool: task #149 expanded it to 21 (silver 6 / gold 8 / prismatic 7)
    // and task #157 re-enabled the per-round 3-choose-1 draft. The original
    // skeleton 3 remain within the pool. EX is still a per-hero ability
    // (champion.exAbility + slot "EX"), NOT an augment. See ex-skills.test.ts.
    expect(Augments.ids()).toEqual(expect.arrayContaining(["bloodlust", "chill-touch", "aegis-surge"]));
    expect(Augments.ids().length).toBe(21);
    expect(Projectiles.ids().length).toBeGreaterThanOrEqual(2);
    expect(LootTables.get("round-reward").entries).toHaveLength(4);

    // content registries (new collections)
    expect(Arenas.get("arena.skeleton").zones).toHaveLength(2);
    expect(Configs.get("config.match").tick.tickHz).toBe(30);
    expect(Models.get("champ.sela").glbPath).toBe("assets/models/champions/mage.glb");
    expect(VfxDefs.ids().length).toBeGreaterThanOrEqual(2);
    expect(StatusEffects.ids().sort()).toEqual(["burnstun", "root", "slow25", "slow30", "slow40"]);
  });

  /**
   * `castTimeSec` is the ONE field where content/ and the TS skeleton are
   * ALLOWED to disagree, so it is stripped before the structural comparison.
   *
   * Why they diverge: the owner's telegraph rule assigns every ability a cast
   * time derived from `castTimeFormula.ts` (damage / CC / AoE / slot, clipped
   * by the ability's own cooldown and effect duration), and that pass rewrites
   * content/ only — `sim/content/skeleton.ts` is a hand-written fixture whose
   * job is to prove the loader, not to carry balance data. Pinned explicitly
   * below so the divergence stays deliberate rather than becoming drift.
   */
  const stripCastTime = (v: unknown): Record<string, unknown> =>
    JSON.parse(
      JSON.stringify(v, (k, val: unknown) => (k === "castTimeSec" ? undefined : val)),
    ) as Record<string, unknown>;

  it("the JSON round-trip reproduces the TS literals exactly (bar castTimeSec)", () => {
    // registered defs came from JSON; they must match the sim's literals
    expect(stripCastTime(Champions.get(SELA.id))).toMatchObject(stripCastTime(SELA));
    expect(stripCastTime(Champions.get(THORNE.id))).toMatchObject(stripCastTime(THORNE));
    expect(stripCastTime(Abilities.get(SELA.abilities.Q.id))).toMatchObject(
      stripCastTime(SELA.abilities.Q),
    );
    expect(Arenas.get(SKELETON_ARENA.id)).toMatchObject(JSON.parse(JSON.stringify(SKELETON_ARENA)));
  });

  it("castTimeSec is the one authorised divergence: content follows the tiered rule", () => {
    // sela.q Ember Bolt: 4 s cooldown -> 1 s after the x0.25 multiplier, so the
    // cooldown ceiling puts it below the 0.3 s floor and it stays INSTANT.
    expect(Abilities.get(SELA.abilities.Q.id).castTimeSec).toBeUndefined();
    // sela.r Firestorm: 450 dmg + a 0.75 s stun + radius 5 -> 0.7 s, clipped by
    // its own stun duration. thorne.r -> 0.6 s. Both were re-derived, NOT the
    // superseded "authored value + 0.3".
    expect(Abilities.get(SELA.abilities.R.id).castTimeSec).toBeCloseTo(0.7, 6);
    expect(Abilities.get(THORNE.abilities.R.id).castTimeSec).toBeCloseTo(0.6, 6);
    // …while the TS skeleton still carries the original hand-written values.
    expect(SELA.abilities.Q.castTimeSec).toBeUndefined();
    expect(SELA.abilities.R.castTimeSec).toBe(0.5);
    expect(THORNE.abilities.R.castTimeSec).toBe(0.4);
  });

  it("has zero hard-ref errors and reports soft warnings explicitly", () => {
    // the generated tree is fully closed: no dangles at all
    expect(result.warnings).toEqual([]);
  });
});

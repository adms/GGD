/**
 * ex-skills (docs/todo/ex-skills.md): the FAITHFUL "EX 技能" mechanic. EX skills
 * are PER-HERO abilities unlocked at the WC3 level-30 gate (research R00R) —
 * NOT a generic augment draft, and NOT every hero has one. This suite proves the
 * ported content + the sim EX slot:
 *   - the authoritative hero→EX map (EX_MAP.json) is a non-empty proper subset;
 *   - the pseudo-EX augment cards are gone (skeleton 3 remain);
 *   - champion.exAbility is set exactly on the heroes that have an EX skill;
 *   - every EX ability doc is a valid single-rank slot-"EX" ability@1;
 *   - the sim exSlot is locked pre-unlock, unlocks via learnEx (+event), then
 *     casts through the normal path and respects cast time; EX-less heroes never
 *     get a slot.
 * Evidence for what "EX 技能" is: tools/w3x-import/out/GoDieEX22s/EX_SKILLS.md +
 * EX_MAP.json (extract_ex.py: areq→R00R gate cross-referenced with hero uabi).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import type { LoadResult } from "./loader";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { spawnChampion } from "../sim/spawnChampion";
import { castAbility, learnEx } from "../sim/abilities/abilitySystem";
import { castResolveSystem } from "../sim/systems/CastResolveSystem";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "../ids";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const EX_MAP_PATH = join(HERE, "../../../../tools/w3x-import/out/GoDieEX22s/EX_MAP.json");

interface ExMap {
  unlockTech: string;
  unlockLevel: number;
  championsWithEx: number;
  heroes: Record<string, { heroRawcode: string; exAbility: string; nameZh: string }>;
  withoutEx: string[];
}

const SKELETON_KEEP = ["bloodlust", "chill-touch", "aegis-surge"] as const;

describe("EX 技能 per-hero ability (ex-skills)", () => {
  let result: LoadResult;
  let exmap: ExMap;

  beforeAll(async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
    registerAll(result.store);
    exmap = JSON.parse(readFileSync(EX_MAP_PATH, "utf-8")) as ExMap;
  });

  // champions in the loaded store that carry an exAbility
  const champsWithEx = (): ChampionId[] =>
    Champions.ids().filter((id) => Champions.get(id).exAbility !== undefined);

  const isRegistered = (cid: string): boolean => Champions.tryGet(cid as ChampionId) !== undefined;

  /**
   * EX_MAP.json is the w3x extraction over the FULL original roster, and it
   * stays that way — it is evidence about the source map, not a roster file.
   * Since the 2026-08-13 legacy migration the OPERATING roster is a strict
   * subset of it: the unreleased heroes live under `content/_legacy/`, outside
   * COLLECTION_NAMES, so the ContentLoader never registers them.
   *
   * Every assertion below therefore reads the map RESTRICTED to what the
   * registry actually shipped. The population is DERIVED from the registry, so
   * archiving or un-archiving a hero moves these numbers on its own — there is
   * no shipped count written down in this file to go stale.
   */
  const liveExHeroes = (): [string, ExMap["heroes"][string]][] =>
    Object.entries(exmap.heroes).filter(([cid]) => isRegistered(cid));
  const liveWithoutEx = (): string[] => exmap.withoutEx.filter(isRegistered);

  it("EX_MAP.json is a non-empty PROPER subset unlocked at R00R/level 30 (ex-map-subset)", () => {
    cover("ex-map-subset");
    expect(existsSync(EX_MAP_PATH)).toBe(true);
    expect(exmap.unlockTech).toBe("R00R");
    expect(exmap.unlockLevel).toBe(30);
    const withEx = liveExHeroes().length;
    const without = liveWithoutEx().length;
    const total = Champions.ids().filter((id) => id.startsWith("godie-")).length;
    expect(withEx).toBeGreaterThan(0);
    expect(withEx).toBeLessThan(total); // NOT every hero has one
    expect(without).toBeGreaterThan(0);
    // the two lists PARTITION the shipped godie roster: every registered godie
    // hero is classified by the map exactly once, and the map invents nobody.
    // Ship a godie hero the extraction never saw and this goes red.
    expect(withEx + without).toBe(total);
  });

  it("pseudo-EX augment cards removed; the closed 30-augment pool stays (ex-augments-removed)", () => {
    cover("ex-augments-removed");
    const ids = new Set<string>(Augments.ids());
    for (const id of SKELETON_KEEP) expect(ids.has(id)).toBe(true);
    // no augment id begins with "ex-" any more — EX is not an augment draft
    expect(Augments.ids().filter((id) => id.startsWith("ex-"))).toEqual([]);
    // #149 pool, prismatic widened 7 -> 16 for the team-health model (a 10-13
    // round match draws 7-9 prismatic cards without replacement), then 16 -> 17
    // when #188 added 破限超頻 (`limit-breaker`). silver 6 / gold 8 /
    // prismatic 17.
    // ⚠️ 2026-08-17（GH#333）：這裡本來寫 `toBe(31)`。那是一個**出貨數量**住進
    // 測試裡，而這一條真正要守的是「EX 不是一張增益卡」——上面兩行就是它。
    // 60 張聖杯願望進池讓它變 91，卻用「pseudo-EX augment cards removed」
    // 這個完全無關的訊息紅。改成守「池子沒有縮水」。
    expect(Augments.ids().length).toBeGreaterThanOrEqual(31);
    expect(result.warnings).toEqual([]); // content tree stays closed
  });

  it("champion.exAbility is set exactly on the EX heroes (ex-champion-ability-set)", () => {
    cover("ex-champion-ability-set");
    const set = new Set(champsWithEx());
    // every shipped EX_MAP hero has the matching exAbility ref on its champion doc
    for (const [cid, info] of liveExHeroes()) {
      const def = Champions.get(cid as ChampionId);
      expect(def.exAbility).toBe(info.exAbility.length ? `${cid}.ex` : undefined);
      expect(def.exAbility).toBe(`${cid}.ex`);
      expect(set.has(cid as ChampionId)).toBe(true);
    }
    // every shipped EX-less hero has NO exAbility
    for (const cid of liveWithoutEx()) {
      expect(Champions.get(cid as ChampionId).exAbility).toBeUndefined();
      expect(set.has(cid as ChampionId)).toBe(false);
    }
    // "EXACTLY": no registered champion carries an exAbility the map does not
    // claim, so the two sides cannot drift apart in either direction.
    expect(set.size).toBe(liveExHeroes().length);
  });

  it("every EX ability is a valid single-rank slot-EX ability (ex-ability-doc-valid)", () => {
    cover("ex-ability-doc-valid");
    const exIds = Abilities.ids().filter((id) => id.endsWith(".ex"));
    expect(exIds.length).toBe(liveExHeroes().length);
    const castTypes = new Set(["targeted", "skillshot", "ground", "self", "dash"]);
    for (const id of exIds) {
      const def = Abilities.get(id);
      expect(def.slot).toBe("EX");
      expect(def.maxRank).toBe(1); // EX is UNLOCKED, never leveled
      expect(def.cooldown.length).toBe(1);
      expect(def.manaCost.length).toBe(1);
      expect(castTypes.has(def.castType)).toBe(true);
      // It actually does something — EITHER castable effects OR a permanent
      // passive. Several EX buttons are natively `Cool = 0` passives (木乃香's
      // 魔力激發 is `AHab` Brilliance Aura with 範圍 50, i.e. self-only): those
      // carry `passive.ranks` and an EMPTY `effects`, and are rejected by
      // `castAbility` with "passive". Requiring effects here is what forced
      // every one of them to ship as an activated self-buff (task #78).
      const passiveRanks = def.passive?.ranks ?? [];
      const doesSomething =
        def.effects.length > 0 ||
        passiveRanks.some((r) => (r.modifiers?.length ?? 0) > 0 || (r.hooks?.length ?? 0) > 0);
      expect(`${id}:does-something`).toBe(`${id}:${doesSomething ? "does-something" : "inert"}`);
      // the owning champion points back at it
      const cid = id.slice(0, -3);
      expect(Champions.get(cid as ChampionId).exAbility).toBe(id);
    }
  });

  // ---- sim EX slot: lock → unlock(event) → cast → cast time ----

  function freshWorld(): SimWorld {
    return new SimWorld(SKELETON_ARENA, 1234);
  }

  it("EX slot is locked before unlock and rejects casts (ex-slot-locked)", () => {
    cover("ex-slot-locked");
    const world = freshWorld();
    const cid = liveExHeroes()[0]![0] as ChampionId;
    const id = spawnChampion(world, {
      championId: cid,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: 0, z: 0 },
      zone: 0,
    });
    const ab = world.abilities.get(id)!;
    expect(ab.exSlot).toBeTruthy();
    expect(ab.exSlot!.rank).toBe(0); // locked
    expect(castAbility(world, id, "EX", { type: "self" })).toBe("not-learned");
  });

  it("learnEx unlocks the slot and emits exUnlock; EX then casts (ex-unlock-cast)", () => {
    cover("ex-unlock-cast");
    const world = freshWorld();
    // pick a self-cast EX so targeting is trivial
    const selfCid = liveExHeroes().find(
      ([cid]) => Abilities.get(`${cid}.ex` as AbilityId).castType === "self",
    )![0] as ChampionId;
    const id = spawnChampion(world, {
      championId: selfCid,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: 0, z: 0 },
      zone: 0,
    });
    const ab = world.abilities.get(id)!;
    const hp = world.health.get(id)!;
    hp.mana = 9999; // cover the high-mana map values

    world.events.length = 0;
    expect(learnEx(world, id)).toBe(true);
    expect(ab.exSlot!.rank).toBe(1);
    expect(world.events.some((e) => e.type === "exUnlock" && e.data.id === id)).toBe(true);
    // idempotent: a second unlock is a no-op
    expect(learnEx(world, id)).toBe(false);

    expect(castAbility(world, id, "EX", { type: "self" })).toBe("ok");
    expect(ab.exSlot!.cooldownRemainingTicks).toBeGreaterThan(0); // cd paid
  });

  it("an EX with cast time defers its effects (ex-cast-time)", () => {
    cover("ex-cast-time");
    const world = freshWorld();
    const ctCid = liveExHeroes().find(
      ([cid]) => (Abilities.get(`${cid}.ex` as AbilityId).castTimeSec ?? 0) > 0,
    )?.[0];
    expect(ctCid).toBeTruthy();
    const id = spawnChampion(world, {
      championId: ctCid as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: 0, z: 0 },
      zone: 0,
    });
    const ab = world.abilities.get(id)!;
    world.health.get(id)!.mana = 9999;
    learnEx(world, id);
    const def = Abilities.get(ab.exSlot!.abilityId);
    // ground/targeted EX need a point; provide one in-range
    const target =
      def.castType === "self" ? ({ type: "self" } as const) : ({ type: "point", point: { x: 1, z: 0 } } as const);
    expect(castAbility(world, id, "EX", target)).toBe("ok");
    expect(ab.cast).toBeTruthy(); // mid-cast (animation-locked)
    expect(ab.cast!.slot).toBe("EX");
    expect(ab.cast!.ticksLeft).toBeGreaterThan(0); // a real wind-up, not instant
    // resolve the cast: step CastResolveSystem until the wind-up elapses
    let guard = 0;
    while (ab.cast && guard++ < 120) {
      world.tick++;
      castResolveSystem(world);
    }
    expect(ab.cast).toBeNull(); // effects fired, cast cleared
  });

  it("heroes without an EX skill never get a slot (ex-no-slot)", () => {
    cover("ex-no-slot");
    const world = freshWorld();
    const cid = liveWithoutEx()[0]! as ChampionId;
    expect(Champions.get(cid).exAbility).toBeUndefined();
    const id = spawnChampion(world, {
      championId: cid,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: 0, z: 0 },
      zone: 0,
    });
    const ab = world.abilities.get(id)!;
    expect(ab.exSlot ?? null).toBeNull();
    expect(learnEx(world, id)).toBe(false); // nothing to unlock
    expect(castAbility(world, id, "EX", { type: "self" })).toBe("not-learned");
  });
});

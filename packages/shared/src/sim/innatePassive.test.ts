/**
 * THE SIXTH SLOT, ACTUALLY APPLIED — 天生技 / innate (`slot: "PASSIVE"`).
 *
 * The owner's rule: 「每個人應該是六種，被動也是包含 slot，我說過他是等級1就獲得」.
 * The importer dropped the innate entirely; the recovery lane put the 108 real
 * `NN-00` docs back on disk. This suite proves the SIM half — that a champion
 * whose innate is the permanent kind actually carries its effect the instant it
 * spawns, with nobody pressing anything.
 *
 * What is asserted, and why each assertion is not vacuous:
 *  1. every champion with `passiveAbility` gets a `passiveSlot` at RANK 1 at
 *     spawn (rank 1, not 0 — the innate is owned, not unlocked like EX);
 *  2. the permanent-kind innates attach their `passive.ranks[0]` as a real
 *     ModifierSource, and the FINAL STAT MOVES BY THE AUTHORED AMOUNT (the
 *     source merely existing would pass even if the pipeline ignored it);
 *  3. the active-kind innates attach NOTHING and stay uncastable — they are
 *     addressable but deliberately inert, not faked as a stat buff;
 *  4. the five champions that carry the SAME 天生技 both inline
 *     (`champion.passive`) and as a standalone doc apply it exactly ONCE;
 *  5. determinism/replay survives: two worlds built from the same seed with the
 *     same intents produce byte-identical digests, tick for tick, with the
 *     innates (including their rng-rolled proc hooks) live.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { registerAll } from "../content/registries";
import { Arenas, Configs, Models, StatusEffects, VfxDefs } from "../content/registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
  championPassive,
} from "./content/registry";
import {
  abilityPassiveSourceId,
  innateSupersedesLegacyPassive,
  isActiveInnate,
  isPassiveInnate,
  isPassiveOnly,
} from "./abilities/abilityPassives";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { detachSource, recomputeStats } from "./stats/statPipeline";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type SeatId } from "../ids";
import type { AbilityDef } from "./content/defs";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;
const NO_INTENTS = new Map<SeatId, IntentFrame>();

/**
 * The 3 heroes the recovery proved genuinely have NO `NN-00` in the source map:
 * godie-h02n 腦包英雄 and godie-u01q 測試英雄 (no abilities at all) and
 * godie-ogld 美白大法師 (has 72-01..04 + 72-002, but no 72-00 exists anywhere in
 * war3map). Their ABSENCE is a recovered fact, not a TODO — pinned here so a
 * later "gap fill" cannot quietly invent a passive for them.
 */
const NO_INNATE: readonly string[] = ["godie-h02n", "godie-ogld", "godie-u01q"];

/** Spawn one champion into a throwaway world and hand back both components. */
function spawnOne(championId: ChampionId, seed = 1234) {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const id = spawnChampion(world, {
    championId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
  });
  return { world, id, ab: world.abilities.get(id)!, sc: world.stats.get(id)! };
}

/** Final value of `stat` with, then without, the innate's ModifierSource. */
function statWithAndWithout(championId: ChampionId, stat: Stat): [number, number] {
  const { world, id, sc } = spawnOne(championId);
  const withIt = sc.final[stat];
  const innate = championPassive(championId)!;
  expect(detachSource(world, id, abilityPassiveSourceId(innate.id))).toBe(true);
  recomputeStats(world, id);
  return [withIt, world.stats.get(id)!.final[stat]];
}

let godieChampions: ChampionId[];
let passiveInnates: AbilityDef[];
let activeInnates: AbilityDef[];

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(result.store);
  godieChampions = Champions.ids().filter((id) => id.startsWith("godie-"));
  const innates = Abilities.all().filter((a) => a.slot === "PASSIVE");
  passiveInnates = innates.filter(isPassiveInnate);
  activeInnates = innates.filter(isActiveInnate);
});

describe("天生技 / innate slot — owned from level 1", () => {
  it("the sixth slot exists at RANK 1 on spawn for every hero that has one", () => {
    cover("innate-slot-rank1-at-spawn");
    // Guard the guard: if content ever stopped shipping innates this suite would
    // pass vacuously, so pin the census first.
    expect(godieChampions.length).toBeGreaterThan(100);
    expect(passiveInnates.length + activeInnates.length).toBe(
      godieChampions.length - NO_INNATE.length,
    );

    const missing: string[] = [];
    for (const cid of godieChampions) {
      const { ab } = spawnOne(cid);
      const expected = Champions.get(cid).passiveAbility;
      if (NO_INNATE.includes(cid)) {
        expect(expected).toBeUndefined();
        expect(ab.passiveSlot ?? null).toBeNull();
        continue;
      }
      if (!ab.passiveSlot || ab.passiveSlot.rank !== 1) {
        missing.push(cid);
        continue;
      }
      expect(ab.passiveSlot.abilityId).toBe(expected);
      // owned, never on cooldown, never leveled
      expect(ab.passiveSlot.cooldownRemainingTicks).toBe(0);
    }
    expect(missing).toEqual([]);
  });

  it("every permanent-kind innate with an authored rank block is LIVE at spawn", () => {
    cover("innate-passive-source-attached");
    // The docs with an empty `ranks[0]` are honest empties (their mechanic —
    // evasion, true-sight, aura-onto-enemies — does not exist in the sim yet);
    // they must NOT create a source. The ones with content must.
    let applied = 0;
    const shouldApplyButDidNot: string[] = [];
    const shouldNotApplyButDid: string[] = [];

    for (const def of passiveInnates) {
      const cid = def.id.replace(/\.passive$/, "") as ChampionId;
      if (!Champions.tryGet(cid)) continue;
      const block = def.passive?.ranks[0];
      // ⚠️ THIS PREDICATE MUST MIRROR `abilityPassives.rankBlock`. It has now
      // drifted twice: `auras` (79-00 靈壓 debuffs everyone nearby and grants
      // its carrier NO stat) and `vision` (27-00 永久性的隱形術 / 16-00 通靈能力
      // — 「看不看得見」 is not a stat either) both make a block non-empty while
      // `modifiers` stays literally `[]`. Counting only modifiers/hooks reported
      // those correctly-attached sources as bugs.
      const authored = Boolean(
        block?.modifiers?.length ||
          block?.hooks?.length ||
          block?.auras?.length ||
          block?.vision ||
          // …and a THIRD time: `flight` (04-00 翔封界 — 「碰不碰得到」 is not a
          // stat either; sim/flight.ts). Same drift, same fix.
          block?.flight,
      );
      const { sc } = spawnOne(cid);
      const has = sc.sources.some((s) => s.id === abilityPassiveSourceId(def.id));
      if (authored && !has) shouldApplyButDidNot.push(def.id);
      if (!authored && has) shouldNotApplyButDid.push(def.id);
      if (authored && has) applied++;
    }

    expect(shouldApplyButDidNot).toEqual([]);
    expect(shouldNotApplyButDid).toEqual([]);
    // Regression floor, not an exact pin: adding modifiers to one of the
    // currently-empty docs should never make this suite red.
    expect(applied).toBeGreaterThanOrEqual(19);
  });

  it("the innate moves the FINAL stat by the authored amount, not just the source list", () => {
    cover("innate-passive-changes-final-stats");
    // 65-00 古老智慧 — flat +100 armor / +100 mr.
    const [armorOn, armorOff] = statWithAndWithout("godie-udea" as ChampionId, Stat.Armor);
    expect(armorOn - armorOff).toBeCloseTo(100, 6);
    const [mrOn, mrOff] = statWithAndWithout("godie-udea" as ChampionId, Stat.MagicResist);
    expect(mrOn - mrOff).toBeCloseTo(100, 6);

    // 28-00 無限再生 — flat +12 health regen. This is one of the five heroes that
    // ALSO carries the legacy inline block, so a +24 here is exactly the
    // double-application bug the supersede guard exists to prevent.
    const [regenOn, regenOff] = statWithAndWithout("godie-huth" as ChampionId, Stat.HealthRegen);
    expect(regenOn - regenOff).toBeCloseTo(12, 6);

    // 32-00 青龍槍術 — percentage-add +30 % attack damage, so the delta is
    // proportional rather than flat: proves the pctAdd path, not just flat.
    const [adOn, adOff] = statWithAndWithout("godie-opgh" as ChampionId, Stat.AttackDamage);
    expect(adOff).toBeGreaterThan(0);
    expect(adOn / adOff).toBeCloseTo(1.3, 6);
  });

  it("a proc-hook innate is armed at spawn without anyone learning anything", () => {
    cover("innate-hook-armed-at-spawn");
    // 01-00 怒斬 — a 15 % on-basic-attack proc. Nothing is cast, nothing is
    // ranked up: the hook must simply be on the entity the tick it exists.
    const { sc } = spawnOne("godie-hart" as ChampionId);
    const src = sc.sources.find((s) => s.id === abilityPassiveSourceId("godie-hart.passive"));
    expect(src).toBeDefined();
    expect(src!.hooks?.[0]?.on).toBe("onBasicAttack");
    expect(src!.hooks?.[0]?.chance).toBeCloseTo(0.15, 6);
  });
});

describe("天生技 / innate slot — the ACTIVE innates stay honestly inert", () => {
  it("active innates grant no passive source and are not passive-only", () => {
    cover("innate-active-not-faked");
    expect(activeInnates.length).toBeGreaterThan(50);
    const faked: string[] = [];
    for (const def of activeInnates) {
      // An active innate must grant NO permanent SELF buff — `syncAbilityPassives`
      // skips it entirely, so a `modifiers`/`hooks` block on one is silently dead
      // content and reads as a balance change nobody gets.
      //
      // `auras` is the ONE exception, and it is not a loophole: an aura reaches
      // OTHER units and is projected by sim/auraCarrier.ts from a dummy carrier
      // entity, which is the only way a SECOND FORM's aura can exist at all (the
      // form swap never re-points `passiveSlot` — see auraCarrier.ts). Today that
      // is `godie-e010.passive` 70-00 芬多精. The `faked` sweep below is the real
      // guard and is UNCHANGED: an active innate still may not put its own
      // ability-passive source on the CHAMPION.
      //
      // ⚠️ The comment this replaced claimed "schema already forbids it". It does
      // not — `refineInnate` (content/schema/ability.ts) only requires a non-empty
      // `effects` on an active innate. Verified 2026-07-29.
      if (def.passive !== undefined) {
        for (const rank of def.passive.ranks) {
          expect(rank.modifiers ?? [], `${def.id}: active innate self-modifiers are dead`).toEqual(
            [],
          );
          expect(rank.hooks ?? [], `${def.id}: active innate hooks are dead`).toEqual([]);
          expect(rank.auras?.length ?? 0, `${def.id}: an auras-only carrier block`).toBeGreaterThan(
            0,
          );
        }
      }
      expect(def.effects.length).toBeGreaterThan(0);
      expect(isPassiveOnly(def)).toBe(false);
      const cid = def.id.replace(/\.passive$/, "") as ChampionId;
      if (!Champions.tryGet(cid)) continue;
      const { sc } = spawnOne(cid);
      if (sc.sources.some((s) => s.id === abilityPassiveSourceId(def.id))) faked.push(def.id);
    }
    expect(faked).toEqual([]);
  });

  it("the innate lives in its OWN instance, never in one of the five", () => {
    cover("innate-not-castable-yet");
    const cid = activeInnates[0]!.id.replace(/\.passive$/, "") as ChampionId;
    const { ab } = spawnOne(cid);
    // addressable: the instance and its def are there for a HUD / codex / sweep
    expect(ab.passiveSlot!.abilityId).toBe(Champions.get(cid).passiveAbility);
    expect(Abilities.get(ab.passiveSlot!.abilityId).slot).toBe("PASSIVE");
    // unreachable: `Command.castAbility` carries an `AbilitySlot`, and none of
    // the five castable instances points at the innate, so no intent frame can
    // fire it. (A follow-up wires these as real casts.)
    const castable = [ab.slots.Q, ab.slots.W, ab.slots.E, ab.slots.R, ab.exSlot ?? null]
      .filter((i) => i !== null)
      .map((i) => i!.abilityId);
    expect(castable).not.toContain(ab.passiveSlot!.abilityId);
  });
});

describe("天生技 / innate slot — no double application", () => {
  it("a hero carrying the same 天生技 inline AND as a doc applies it exactly once", () => {
    cover("innate-supersedes-legacy-inline-passive");
    const both = godieChampions.filter((cid) => {
      const c = Champions.get(cid);
      return c.passive !== undefined && c.passiveAbility !== undefined;
    });
    expect(both.length).toBeGreaterThan(0);

    for (const cid of both) {
      const champ = Champions.get(cid);
      const innate = championPassive(cid)!;
      // The two really are the same ability — if a future edit made them
      // different abilities, dropping the inline one would be data loss, and
      // this is where that would be caught.
      expect(champ.passive!.name).toBe(innate.name);
      expect(innateSupersedesLegacyPassive(champ)).toBe(true);

      const { sc } = spawnOne(cid);
      expect(sc.sources.some((s) => s.id === `passive:${cid}`)).toBe(false);
      const innateSources = sc.sources.filter((s) => s.id === abilityPassiveSourceId(innate.id));
      expect(innateSources.length).toBe(1);
    }
  });

  it("a hero with an inline passive and NO innate doc keeps its inline block", () => {
    cover("innate-legacy-only-champion-untouched");
    // The demo-skeleton champions (thorne "Barkskin", sela "Kindling") have no
    // NN-00 at all: their inline block is the only definition and must survive.
    const legacyOnly = Champions.ids().filter((cid) => {
      const c = Champions.get(cid);
      return c.passive !== undefined && c.passiveAbility === undefined;
    });
    expect(legacyOnly.length).toBeGreaterThan(0);
    for (const cid of legacyOnly) {
      expect(innateSupersedesLegacyPassive(Champions.get(cid))).toBe(false);
      const { sc } = spawnOne(cid);
      expect(sc.sources.some((s) => s.id === `passive:${cid}`)).toBe(true);
    }
  });
});

describe("天生技 / innate slot — determinism survives", () => {
  /** Six-champion world: proc-hook innates, stat innates, and an active innate. */
  function buildWorld(seed: number): SimWorld {
    const world = new SimWorld(SKELETON_ARENA, seed);
    const roster: ChampionId[] = [
      "godie-hart", // 01-00 怒斬 — 15 % onBasicAttack proc (rolls world.rng)
      "godie-h02k", // 89-00 憤怒的門牙 — 3 % onBasicAttack proc
      "godie-udea", // 65-00 古老智慧 — flat armor/mr
      "godie-opgh", // 32-00 青龍槍術 — pctAdd ad
      "godie-huth", // 28-00 無限再生 — flat regen (also legacy-inline)
      "godie-e001", // 22-00 嗚鎖打! — ACTIVE innate, must stay inert
    ] as ChampionId[];
    roster.forEach((cid, i) => {
      spawnChampion(world, {
        championId: cid,
        seatId: asSeatId(i),
        teamId: asTeamId(i % 2),
        pos: { x: Z0.center.x + (i % 2 === 0 ? -3 : 3), z: Z0.center.z + i },
        zone: 0,
      });
    });
    return world;
  }

  it("same seed ⇒ byte-identical digests, tick for tick, with innates live", () => {
    cover("innate-determinism-holds");
    const a = buildWorld(20260724);
    const b = buildWorld(20260724);
    expect(a.digest()).toBe(b.digest());
    for (let t = 0; t < 300; t++) {
      a.step(NO_INTENTS);
      b.step(NO_INTENTS);
      if (a.digest() !== b.digest()) {
        throw new Error(`digest diverged at tick ${t}: ${a.digest()} vs ${b.digest()}`);
      }
    }
    expect(a.digest()).toBe(b.digest());
    expect(a.tick).toBe(300);
  });

  it("a different seed is a different world (the digest is not a constant)", () => {
    cover("innate-determinism-seed-sensitive");
    const a = buildWorld(20260724);
    const c = buildWorld(999);
    for (let t = 0; t < 300; t++) {
      a.step(NO_INTENTS);
      c.step(NO_INTENTS);
    }
    // Proves the previous test is measuring something: with proc rolls riding
    // world.rng, two different seeds must not coincide.
    expect(a.digest()).not.toBe(c.digest());
  });
});

/**
 * AURA CARRIERS (虛擬蝗蟲群) — owner's 2026-07-29 ruling, measured.
 *
 * 「既然是光環,那就是範圍效果,你可以運用編輯器技巧,創造一個虛擬看不到也點不到的
 *   蝗蟲群,身上有光環回血 5% 技能,每秒鐘跟隨角色調整座標就好,只是記得結束要清除
 *   相關資源跟變數,每場開始要重新打開設定」
 *
 * Every `it` below is one falsifiable half of that sentence, and every one of
 * them was MUTATION-VERIFIED (break the production line it guards → this suite
 * goes red → put it back). The mutations are named in the report.
 *
 * WHAT WOULD MAKE THIS SUITE A LIE, and what stops it:
 *   · 「掃屬性」 — reading `sources` and calling it done. So the ally test reads
 *     the FINAL `healthRegen` number off the stat pipeline, not the presence of
 *     an aura source, and pins it against the SAME champion with no carrier.
 *   · 「畫面外」 — a carrier that works but renders. `projectSnapshot` is not
 *     importable from `packages/shared` (it lives in apps/game-server and pulls
 *     Colyseus), so the render guard here asserts the two properties the
 *     snapshot's own skip is written against — the carrier IS in
 *     `world.transform` (aura.ts needs it) and it has NO ChampionComp, i.e. it
 *     would fall through to the champion default — plus the grid exclusion that
 *     makes it untargetable. The wire half is pinned by the guard in
 *     apps/game-server/src/net/snapshot.ts itself.
 *   · 「刪掉還全綠」 — the census test: with the feature disarmed there must be
 *     ZERO carriers, and the aura test must therefore fail. Both directions are
 *     asserted so neither can pass vacuously.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { Abilities, Champions } from "./content/registry";
import { spawnChampion } from "./spawnChampion";
import { applyChampionForm, FORM_NEVER_EXPIRES } from "./systems/ChampionFormSystem";
import { queryOverlap } from "./collision/queries";
import { acquireTarget, isAutoTargetable } from "./targeting";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { activeAuraSources } from "./aura/aura";
import { auraCarrierFor, auraCarrierSourceId, endCombatAuraCarriers } from "./auraCarrier";
import type { AbilityDef, ChampionDef } from "./content/defs";
import {
  asSeatId,
  asTeamId,
  type AbilityId,
  type ChampionId,
  type EntityId,
  type SeatId,
} from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

/**
 * Fixtures stand on ONE clear line, `x = zoneCentre.x + 12` — the skeleton zone
 * has a `radius: 2.5` pillar on its exact centre, and a body spawned inside an
 * obstacle is shoved out over the following ticks, which would silently change
 * the distance every radius assertion here is measuring. (Copied deliberately
 * from aura.test.ts: same arena, same trap.)
 */
const LINE_X = Z0.center.x + 12;
const P = (dz: number): { x: number; z: number } => ({ x: LINE_X, z: Z0.center.z + dz });

/** 芬多精's own numbers: w3a `A0GM` area 250 → 250·11/600 = 4.58, +5 % regen. */
const AURA_RADIUS = 4.58;
const AURA_PCT = 0.05;

const BASE = "carrier-base" as ChampionId;
const ROOTED = "carrier-rooted" as ChampionId;
const BASE_INNATE = "carrier-base.passive" as AbilityId;
const ROOTED_INNATE = "carrier-rooted.passive" as AbilityId;

/**
 * A SYNTHETIC transform pair in the exact shape 白木卡迪那 ships in:
 * `carrier-base` ⇄ `carrier-rooted`, both innates `innateKind: "active"`
 * (a toggle must be pressable), the aura authored ONLY on the alternate's doc.
 *
 * Synthetic rather than the real `godie-e00s`/`godie-e010`, for the reason
 * aura.test.ts gives: this suite must not go red because a concurrent content
 * lane re-balanced a champion. The REAL doc is pinned separately, by reading
 * the file, at the bottom.
 */
function registerPair(): void {
  const innate = (id: AbilityId, withAura: boolean): AbilityDef =>
    ({
      id,
      name: id,
      slot: "PASSIVE",
      innateKind: "active",
      castType: "self",
      maxRank: 1,
      cooldown: [0],
      manaCost: [0],
      range: 0,
      effects: [{ kind: "championForm", to: "toggle" }],
      ...(withAura
        ? {
            passive: {
              ranks: [
                {
                  auras: [
                    {
                      key: "phytoncide",
                      radius: AURA_RADIUS,
                      affects: "ally",
                      modifiers: [
                        { stat: Stat.HealthRegen, op: ModOp.PercentAdd, value: AURA_PCT },
                      ],
                    },
                  ],
                },
              ],
            },
          }
        : {}),
    }) as unknown as AbilityDef;
  Abilities.register(BASE_INNATE, innate(BASE_INNATE, false));
  Abilities.register(ROOTED_INNATE, innate(ROOTED_INNATE, true));

  const thorne = Champions.get("thorne" as ChampionId);
  const body = (id: ChampionId, innateId: AbilityId, counterpart: ChampionId): ChampionDef =>
    ({
      ...thorne,
      id,
      passiveAbility: innateId,
      transform: {
        role: id === BASE ? "base" : "alternate",
        counterpartId: counterpart,
      },
    }) as unknown as ChampionDef;
  Champions.register(BASE, body(BASE, BASE_INNATE, ROOTED));
  Champions.register(ROOTED, body(ROOTED, ROOTED_INNATE, BASE));
}

beforeAll(() => {
  registerSkeletonContent();
  registerPair();
});

let world: SimWorld;
let seat = 0;

beforeEach(() => {
  world = new SimWorld(SKELETON_ARENA, 20260729);
  // COMBAT IS LIVE. The carrier is combat-scoped by construction (owner's
  // 「每場開始要重新打開設定」), so a suite that forgot this line would assert
  // the feature does nothing — see the disarmed-census test for the other side.
  world.combatActive = true;
});

function spawn(champion: ChampionId, team: 0 | 1, at: { x: number; z: number }): EntityId {
  return spawnChampion(world, {
    championId: champion,
    seatId: asSeatId(seat++),
    teamId: asTeamId(team),
    pos: at,
    zone: 0,
  });
}

/** Root the host — the same call `EffectDef.championForm` makes. */
function root(host: EntityId): void {
  expect(applyChampionForm(world, host, "toggle", undefined, { origin: "test" })).toBe(true);
}

const regenOf = (id: EntityId): number => world.stats.get(id)!.final[Stat.HealthRegen];
const carrierIds = (): EntityId[] => [...world.auraCarrier.keys()];

describe("虛擬蝗蟲群 — a form-scoped aura, carried by a dummy the player never meets", () => {
  it("本體 has NO aura; the ROOTED form does — owner's ruling, both directions", () => {
    cover("aura-carrier-form-scoped");
    const host = spawn(BASE, 0, P(0));
    const ally = spawn(BASE, 0, P(3));
    world.step(NO_INTENTS);

    // BASE BODY: nothing, on either unit, and no carrier exists at all.
    expect(carrierIds(), "本體 spawns no carrier").toEqual([]);
    expect(activeAuraSources(world, ally), "本體 projects nothing").toEqual([]);
    const allyBase = regenOf(ally);

    root(host);
    world.step(NO_INTENTS);

    expect(carrierIds().length, "紮根 spawns exactly one carrier").toBe(1);
    expect(auraCarrierFor(world, host), "…and it belongs to the host").toBe(carrierIds()[0]);
    const src = activeAuraSources(world, ally);
    expect(src.length, "the ally is inside it").toBe(1);
    expect(src[0]!.auraOrigin?.emitter, "emitted BY THE CARRIER, not the champion").toBe(
      carrierIds()[0],
    );
    expect(src[0]!.id, "…under the carrier's own source id").toContain(
      auraCarrierSourceId(ROOTED_INNATE),
    );
    // The champion itself never carries the emitting source — that is exactly
    // the authorization hole this whole mechanism exists to route around.
    expect(
      world.stats.get(host)!.sources.some((s) => s.auras !== undefined),
      "the champion is NOT the emitter",
    ).toBe(false);

    // …AND THE NUMBER MOVED. Read off the finished stat pipeline, not off the
    // presence of a source (「掃屬性」 is a fake pass).
    expect(regenOf(ally)).toBeCloseTo(allyBase * (1 + AURA_PCT), 6);
    expect(regenOf(ally)).toBeGreaterThan(allyBase);
  });

  it("reaches allies INSIDE the radius only, and never an enemy", () => {
    cover("aura-carrier-form-scoped");
    const host = spawn(BASE, 0, P(0));
    const near = spawn(BASE, 0, P(3)); // 3 < 4.58 → in
    const far = spawn(BASE, 0, P(8)); // 8 > 4.58 → out
    const enemy = spawn(BASE, 1, P(2)); // 2 < 4.58, wrong team
    world.step(NO_INTENTS);
    const before = {
      near: regenOf(near),
      far: regenOf(far),
      enemy: regenOf(enemy),
    };

    root(host);
    world.step(NO_INTENTS);

    expect(regenOf(near), "inside the 4.58 radius").toBeCloseTo(before.near * (1 + AURA_PCT), 6);
    expect(regenOf(far), "outside it").toBeCloseTo(before.far, 6);
    expect(regenOf(enemy), "an enemy standing closer than the ally still gets nothing").toBeCloseTo(
      before.enemy,
      6,
    );
    expect(activeAuraSources(world, enemy)).toEqual([]);
    expect(activeAuraSources(world, far)).toEqual([]);
  });

  it("FOLLOWS the host every tick — an ally the host walks up to gains it", () => {
    cover("aura-carrier-follow");
    const host = spawn(BASE, 0, P(0));
    const ally = spawn(BASE, 0, P(10)); // out of reach at spawn
    root(host);
    world.step(NO_INTENTS);
    expect(activeAuraSources(world, ally), "10 units away: nothing").toEqual([]);

    // Teleport the host next to the ally (no orders needed — the point under
    // test is the CARRIER copy, not the movement system).
    world.transform.get(host)!.pos = P(8);
    world.step(NO_INTENTS);

    const carrier = auraCarrierFor(world, host)!;
    expect(world.transform.get(carrier)!.pos, "the carrier moved WITH the host").toEqual(P(8));
    expect(activeAuraSources(world, ally).length, "…and the aura arrived with it").toBe(1);
  });

  it("REVERTING destroys the carrier and drops the aura from every ally", () => {
    cover("aura-carrier-teardown");
    const host = spawn(BASE, 0, P(0));
    const ally = spawn(BASE, 0, P(3));
    root(host);
    world.step(NO_INTENTS);
    const boosted = regenOf(ally);
    expect(carrierIds().length).toBe(1);

    // Toggle back to 本體.
    expect(applyChampionForm(world, host, "toggle", undefined, { origin: "test" })).toBe(true);
    world.step(NO_INTENTS);

    expect(carrierIds(), "the carrier is DESTROYED, not parked").toEqual([]);
    // host + ally, and nothing else: the carrier's transform is gone, not orphaned.
    expect(world.transform.size, "…and its transform is gone too").toBe(2);
    expect(activeAuraSources(world, ally)).toEqual([]);
    expect(regenOf(ally)).toBeLessThan(boosted);
  });

  it("DEATH, ROUND END and endCombat each leave zero carriers behind", () => {
    cover("aura-carrier-teardown");

    // (a) death — championFormSystem reverts a corpse, the carrier follows.
    const dead = spawn(BASE, 0, P(0));
    root(dead);
    world.step(NO_INTENTS);
    expect(carrierIds().length).toBe(1);
    const hp = world.health.get(dead)!;
    hp.hp = 0;
    hp.alive = false;
    world.step(NO_INTENTS);
    expect(carrierIds(), "a corpse carries nothing").toEqual([]);

    // (b) the duel in this zone is decided (#216: combat is over HERE).
    const settled = spawn(BASE, 0, P(6));
    root(settled);
    world.step(NO_INTENTS);
    expect(carrierIds().length).toBe(1);
    world.settledZones.add(0);
    world.step(NO_INTENTS);
    expect(carrierIds(), "a settled zone stops regenerating its winner").toEqual([]);
    world.settledZones.clear();

    // (c) combat exit — both the explicit seam and the per-tick reconcile.
    world.step(NO_INTENTS);
    expect(carrierIds().length, "combat resumed → rebuilt (每場開始要重新打開)").toBe(1);
    endCombatAuraCarriers(world);
    expect(carrierIds(), "the explicit host seam").toEqual([]);
    world.step(NO_INTENTS);
    world.combatActive = false;
    world.step(NO_INTENTS);
    expect(carrierIds(), "…and the reconcile alone would have done it too").toEqual([]);
    // NOTHING is left behind in ANY store — the owner's 「清除相關資源跟變數」.
    for (const t of world.transform.keys()) expect(world.auraCarrier.has(t)).toBe(false);
    expect(world.stats.size, "only the two champions still hold stats").toBe(2);
  });

  it("the carrier cannot be SEEN, SELECTED, auto-attacked or shoved", () => {
    cover("aura-carrier-invisible");
    const host = spawn(BASE, 0, P(0));
    const enemy = spawn(BASE, 1, P(1));
    root(host);
    world.step(NO_INTENTS);
    // A SECOND step, and it is load-bearing: `rebuildGrid` runs at the TOP of
    // `step`, so the tick that CREATES a carrier rebuilt its grid before the
    // carrier existed. Asserting the grid exclusion after one step would pass
    // even with the exclusion deleted — the classic 「刪掉還全綠」.
    world.step(NO_INTENTS);
    const carrier = auraCarrierFor(world, host)!;

    // IN `world.transform` — aura.ts reads the emitter's position from there,
    // so this is a REQUIREMENT, and it is exactly what makes the snapshot skip
    // in apps/game-server/src/net/snapshot.ts load-bearing.
    expect(world.transform.has(carrier)).toBe(true);
    // …and it would fall through that projection's CHAMPION default, which is
    // what would paint it: no ChampionComp, so `es.key` would be "".
    expect(world.champion.has(carrier), "no ChampionComp → kind 0 + empty modelKey").toBe(false);

    // NOT IN THE BROAD-PHASE → invisible to every spatial query in the sim.
    const everything = queryOverlap(world, {
      kind: "circle",
      center: P(0),
      radius: 50,
    });
    expect(everything).not.toContain(carrier);
    expect(everything, "the guard is not vacuous — real bodies DO come back").toContain(host);

    // NOT AUTO-TARGETABLE, on its own merits as well as through the grid.
    expect(isAutoTargetable(world, enemy, carrier)).toBe(false);
    expect(acquireTarget(world, enemy, 50)?.id, "the enemy locks the champion").toBe(host);

    // NOT A BODY: zero radius, no health, no navigation, no seat of its own.
    expect(world.transform.get(carrier)!.radius).toBe(0);
    expect(world.health.has(carrier)).toBe(false);
    expect(world.nav.has(carrier)).toBe(false);
    expect(world.team.get(carrier)!.seatId, "the neutral sentinel, never a real seat").toBe(-1);
    expect(world.team.get(carrier)!.teamId, "…but the host's team, so 友軍 resolves").toBe(
      world.team.get(host)!.teamId,
    );

    // …and it never shoves anybody: an enemy body-to-body with the host stays
    // exactly where the champion separation puts it, carrier or no carrier.
    const withCarrier = { ...world.transform.get(enemy)!.pos };
    endCombatAuraCarriers(world);
    world.combatActive = false;
    world.step(NO_INTENTS);
    expect(world.transform.get(enemy)!.pos.x).toBeCloseTo(withCarrier.x, 6);
  });

  it("is DETERMINISTIC: two runs of the same seed agree tick by tick", () => {
    cover("aura-carrier-deterministic");
    const run = (seed: number): { digest: number; rng: number; carriers: number } => {
      const w = new SimWorld(SKELETON_ARENA, seed);
      w.combatActive = true;
      let s = 500;
      const ids: EntityId[] = [];
      for (const [team, dz] of [
        [0, 0],
        [0, 3],
        [1, 6],
      ] as const) {
        ids.push(
          spawnChampion(w, {
            championId: BASE,
            seatId: asSeatId(s++),
            teamId: asTeamId(team),
            pos: P(dz),
            zone: 0,
          }),
        );
      }
      for (let i = 0; i < 300; i++) {
        // Toggle the form on a fixed schedule so create AND destroy both run
        // many times inside the measured window.
        if (i % 40 === 7) applyChampionForm(w, ids[0]!, "toggle", undefined, { origin: "t" });
        w.step(NO_INTENTS);
      }
      return { digest: w.digest(), rng: w.rng.state, carriers: w.auraCarrier.size };
    };
    const a = run(9001);
    const b = run(9001);
    expect(a).toEqual(b);
    // The carrier draws NO rng: a world that toggled 7 times must have burned
    // exactly the same rng as one that never did.
    const still = new SimWorld(SKELETON_ARENA, 9001);
    still.combatActive = true;
    for (let i = 0; i < 300; i++) still.step(NO_INTENTS);
    expect(a.rng, "no rng draw came from the carrier lane").toBe(still.rng.state);
    // Guard the guard: a DIFFERENT seed must actually diverge, or the equality
    // above is measuring nothing.
    expect(run(9002).digest).not.toBe(a.digest);
  });

  it("DISARMED (out of combat) there is no carrier and no aura at all", () => {
    cover("aura-carrier-form-scoped");
    world.combatActive = false;
    const host = spawn(BASE, 0, P(0));
    const ally = spawn(BASE, 0, P(3));
    world.step(NO_INTENTS);
    const before = regenOf(ally);
    root(host);
    for (let i = 0; i < 5; i++) world.step(NO_INTENTS);
    expect(carrierIds()).toEqual([]);
    expect(regenOf(ally), "…and the ally's number really is untouched").toBeCloseTo(before, 6);
  });

  it("a form whose innate authors NO auras gets no carrier (not 'everything gets one')", () => {
    cover("aura-carrier-form-scoped");
    // `carrier-base`'s own innate has no `passive` block, so toggling INTO it
    // from the rooted body must produce nothing.
    const host = spawn(ROOTED, 0, P(0));
    world.step(NO_INTENTS);
    // Spawned directly as the alternate body — but with no ChampionFormComp,
    // so it is by definition "at home" and emits nothing.
    expect(carrierIds(), "no form component = 本體, whatever the doc says").toEqual([]);
    // Now give it one, pointing at the OTHER body: still nothing, because that
    // body's innate authors no auras.
    world.championForm.set(host, { index: 1, baseId: ROOTED, expiresTick: FORM_NEVER_EXPIRES });
    world.champion.get(host)!.championId = BASE;
    world.stats.get(host)!.championId = BASE;
    world.step(NO_INTENTS);
    expect(carrierIds(), "an aura-less alternate carries nothing").toEqual([]);
  });
});

describe("70-00 芬多精 — the SHIPPED numbers", () => {
  /**
   * Read BY PATH, not through `ContentLoader` — the same choice abilityMirror /
   * championFormToggle make, so this stays green both before and after
   * `pnpm content:build` rebuilds `_index.json`.
   */
  const doc = JSON.parse(
    readFileSync(join(CONTENT_DIR, "abilities/godie-e010.passive.json"), "utf-8"),
  ) as {
    innateKind?: string;
    effects: { kind: string }[];
    passive?: { name?: string; ranks: { auras?: Record<string, unknown>[] }[] };
  };

  it("lives on the ROOTED body's innate doc, as an auras-only block", () => {
    cover("aura-carrier-content");
    // It must stay ACTIVE (紮根 is the toggle back out) — which is precisely why
    // `syncAbilityPassives` will never attach this block and a carrier is needed.
    expect(doc.innateKind).toBe("active");
    expect(doc.effects.some((e) => e.kind === "championForm")).toBe(true);
    const rank = doc.passive?.ranks[0];
    expect(rank?.auras?.length, "the 芬多精 aura is authored").toBe(1);
    expect(doc.passive?.name).toContain("芬多精");
    // No self-modifiers: the pre-#249 doc shipped this as a SELF `healthRegen`
    // +5 %, which is a different ability — 「周圍250的友軍」 is an aura.
    expect((rank as Record<string, unknown>).modifiers).toBeUndefined();
    expect((rank as Record<string, unknown>).hooks).toBeUndefined();
  });

  it("carries the w3a A0GM numbers: 250 → 4.58 radius, +5 % healthRegen, 友軍", () => {
    cover("aura-carrier-content");
    const aura = doc.passive!.ranks[0]!.auras![0]! as {
      radius: number;
      affects: string;
      modifiers: { stat: string; op: string; value: number }[];
    };
    // `area{1}=250` through `toLen` (content/templates/expand.ts, ×11/600).
    expect(aura.radius).toBeCloseTo(250 * (11 / 600), 2);
    expect(aura.affects, "「周圍250的友軍」").toBe("ally");
    expect(aura.modifiers).toEqual([
      { stat: "healthRegen", op: "pctAdd", value: 0.05 }, // `data{1}{1}=0.05`
    ]);
  });
});

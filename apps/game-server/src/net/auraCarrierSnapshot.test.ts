/**
 * AURA CARRIERS NEVER REACH THE WIRE (虛擬蝗蟲群, owner 2026-07-29).
 *
 * `sim/auraCarrier.ts` has to keep its dummy emitters in `world.transform` —
 * `auraSystem` reads an emitter's position from there and nowhere else — and
 * `projectSnapshot` iterates exactly that map. A carrier has no ChampionComp,
 * so without a skip it would fall through to the CHAMPION default and be
 * published as `kind: 0` with `key: ""`; EntityViewRegistry builds a
 * `ChampionView` for kind 0 unconditionally, i.e. a modelless voxel stand-in
 * painted on the arena floor next to the rooted hero.
 *
 * This suite is the guard for that one line. It builds the carrier's WORLD
 * SHAPE by hand rather than by rooting a champion, deliberately: the thing
 * under test is the projection, and a test that first had to find a hero with a
 * transform pair would go red for content reasons that have nothing to do with
 * the wire.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { MatchState } from "@ggd/shared/protocol/schema";
import { asSeatId } from "@ggd/shared/ids";
import { zeroStats } from "@ggd/shared/sim/stats/statTypes";
import { projectSnapshot } from "./snapshot";

const CFG = {
  champSelectTicks: 5,
  intermissionTicks: 20,
  combatMaxTicks: 100_000,
  resolutionTicks: 5,
};

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function toCombat(seed: number): MatchController {
  const ctl = new MatchController("ac", seed, allBots(), CFG);
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  return ctl;
}

describe("虛擬蝗蟲群 is invisible on the wire", () => {
  it("a carrier is in world.transform but NOT in the projected entity list", () => {
    cover("aura-carrier-invisible");
    const ctl = toCombat(4242);
    const world = ctl.world;

    // A champion to prove the projection is working at all (non-vacuity).
    const someChampion = [...world.champion.keys()][0]!;
    const host = world.transform.get(someChampion)!;

    // …and a carrier in exactly the shape `createCarrier` builds: transform +
    // stats + the marker, no ChampionComp, no Health, radius 0.
    const carrier = world.spawn();
    world.transform.set(carrier, {
      pos: { x: host.pos.x, z: host.pos.z },
      vel: { x: 0, z: 0 },
      facing: { x: 0, z: 1 },
      radius: 0,
      zone: host.zone,
    });
    world.team.set(carrier, {
      teamId: world.team.get(someChampion)!.teamId,
      seatId: asSeatId(-1),
    });
    world.stats.set(carrier, {
      championId: world.stats.get(someChampion)!.championId,
      final: zeroStats(),
      dirty: false,
      sources: [],
    });
    world.auraCarrier.set(carrier, {
      host: someChampion,
      championId: world.champion.get(someChampion)!.championId,
      abilityId: "godie-e010.passive" as never,
    });

    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());

    expect(world.transform.has(carrier), "it IS in the sim — aura.ts needs it").toBe(true);
    expect(
      state.entities.has(String(carrier)),
      "…and it is NOT on the wire, so nothing can draw it",
    ).toBe(false);
    // The guard is not vacuous: real bodies DO get published by this same loop.
    expect(state.entities.has(String(someChampion))).toBe(true);
  });

  it("a carrier already on the wire is SWEPT OFF, not kept alive by the skip", () => {
    cover("aura-carrier-invisible");
    const ctl = toCombat(4243);
    const world = ctl.world;
    const someChampion = [...world.champion.keys()][0]!;
    const host = world.transform.get(someChampion)!;

    // Publish first (no marker yet) — this is the reconnect / mid-round-toggle
    // shape: an id the client has already seen.
    const carrier = world.spawn();
    world.transform.set(carrier, {
      pos: { x: host.pos.x, z: host.pos.z },
      vel: { x: 0, z: 0 },
      facing: { x: 0, z: 1 },
      radius: 0,
      zone: host.zone,
    });
    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    expect(state.entities.has(String(carrier)), "published while unmarked").toBe(true);

    // Now it becomes a carrier. The skip must run BEFORE `seen.add`, or the
    // despawn sweep at the bottom of the loop would keep the stale view alive.
    world.auraCarrier.set(carrier, {
      host: someChampion,
      championId: world.champion.get(someChampion)!.championId,
      abilityId: "godie-e010.passive" as never,
    });
    projectSnapshot(ctl, state, new Map());
    expect(state.entities.has(String(carrier)), "swept off the wire").toBe(false);
  });
});

/**
 * 召喚物 REACHES THE WIRE WITH A REAL MESH (GH#289 lane P2).
 *
 * A summon is deliberately not a champion (`deathSystem` pays kill gold + the
 * once-per-victim bounty for anything `world.champion.has()`) and not a mob
 * (the #215 wave scheduler counts `world.mob` against its own cap and pays 20
 * gold per kill from that ledger). So it falls all the way through
 * `projectSnapshot`'s branch ladder to the CHAMPION DEFAULT — and that default
 * used to read the mesh off `world.champion`, which a summon has not.
 *
 * The result would have been `kind: 0` with `key: ""`, and EntityViewRegistry
 * builds a `ChampionView` for kind 0 unconditionally: a modelless voxel
 * stand-in on the arena floor. That is failure shape ② with a green test suite
 * — the sim computed a summon, the wire carried it, and the player sees a blob.
 *
 * This suite is the guard for that one lookup. It is the SNAPSHOT half; the sim
 * half (bodies, expiry, cap, owner death) is
 * `packages/shared/src/sim/effects/summon.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { MatchState } from "@ggd/shared/protocol/schema";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import type { EffectDef } from "@ggd/shared/sim/effects/effect";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
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
  const ctl = new MatchController("sm", seed, allBots(), CFG);
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  return ctl;
}

describe("召喚物 on the wire (gh289-summon-wire)", () => {
  it("is PUBLISHED, and with the summoned champion's own model key", () => {
    cover("gh289-summon-wire");
    const ctl = toCombat(4242);
    const world = ctl.world;
    const caster = [...world.champion.keys()][0]!;
    const body = world.stats.get(caster)!.championId;

    // The SHIPPED path: the handler through the SHIPPED dispatch, exactly as an
    // ability doc reaches it (⑤ 被測的不是出貨的那個).
    runEffects(
      [{ kind: "summon", championId: body, count: 1, durationSec: 30 } satisfies EffectDef],
      { world, caster, rank: 1, targets: [], origin: "ability:test.summon", rng: world.rng },
    );
    const id = [...world.summon.keys()][0]!;
    expect(id, "the handler placed nothing").toBeDefined();

    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());

    const es = state.entities.get(String(id));
    expect(es, "the summon never reached the wire at all").toBeDefined();
    // NOT `expect(es!.key).not.toBe("")` — that would pass on any junk string.
    // The mesh must be the SUMMONED champion's, which is what makes 「召喚了
    // 皮卡丘卻長成別人」 red as well as 「長成一團方塊」.
    expect(es!.key).toBe(Champions.get(body as ChampionId).modelKey);
    expect(es!.alive).toBe(true);
    expect(es!.maxHp, "a health bar needs the maxima the sim actually gave it").toBeGreaterThan(0);
    // seatId -1: a summon is not a player, so no nameplate and no per-seat HUD
    // panel may adopt it.
    expect(es!.seatId).toBe(-1);
  });

  it("stays published while it lives and is SWEPT OFF when it despawns", () => {
    cover("gh289-summon-wire");
    const ctl = toCombat(4243);
    const world = ctl.world;
    const caster = [...world.champion.keys()][0]!;
    const body = world.stats.get(caster)!.championId;

    runEffects(
      [{ kind: "summon", championId: body, count: 1, durationSec: 1 } satisfies EffectDef],
      { world, caster, rank: 1, targets: [], origin: "ability:test.summon", rng: world.rng },
    );
    const id = [...world.summon.keys()][0]!;

    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    expect(state.entities.has(String(id)), "not published while alive").toBe(true);

    // Past the 1 s deadline: `summonSystem` destroys the entity, so the despawn
    // sweep at the bottom of the projection loop must drop the view too — a
    // stale entity left on the wire is a corpse the client keeps drawing.
    for (let i = 0; i < 45; i++) ctl.tick();
    projectSnapshot(ctl, state, new Map());
    expect(world.transform.has(id), "the sim still holds the body").toBe(false);
    expect(state.entities.has(String(id)), "a despawned summon is still on the wire").toBe(false);
  });
});

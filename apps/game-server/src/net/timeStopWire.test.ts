import { describe, it, expect } from "vitest";
import { Decoder, Encoder } from "@colyseus/schema";
import { ENTITY_KIND, ENTITY_FLAG, MatchState } from "@ggd/shared/protocol/schema";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import { timeStopSystem } from "@ggd/shared/sim/timeStop";
import { MatchController } from "../match/MatchController";
import { fullStateBytes } from "../testkit/wireFullState";
import { projectSnapshot } from "./snapshot";

describe("time stop snapshot transport", () => {
  it("joining mid-field receives the radius and stopped bodies; expiry removes both", () => {
    const ctl = new MatchController("trap-wire", 42, Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
      { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 });
    while (ctl.phase.phase !== "combat") ctl.tick();
    const world = ctl.world, owner = [...world.champion.keys()][0]!, t = world.transform.get(owner)!;
    const enemy = [...world.champion.keys()].find(id => world.team.get(id)!.teamId !== world.team.get(owner)!.teamId)!;
    world.transform.get(enemy)!.pos = { ...t.pos }; world.transform.get(enemy)!.zone = t.zone;
    runEffects([{ kind: "timeStop", radius: 4, durationSec: 1.2 }],
      { world, caster: owner, targets: [], rank: 1, origin: "ability:time-stop-wire", rng: world.rng });
    const id = [...world.timeStop.keys()][0]!;
    const read = () => {
      const state = new MatchState(); projectSnapshot(ctl, state, new Map());
      const encoded = fullStateBytes(new Encoder(state), state), decoded = new MatchState();
      new Decoder(decoded).decode(encoded, { offset: 1 }); return decoded;
    };
    const first = read().entities.get(String(id))!;
    expect(first).toMatchObject({ kind: ENTITY_KIND.TIME_STOP, hp: 36, maxHp: 0, shield: 4, mana: world.team.get(owner)!.teamId, maxMana: 0, alive: true });
    expect(read().entities.get(String(enemy))!.flags & ENTITY_FLAG.TIME_STOPPED).toBe(ENTITY_FLAG.TIME_STOPPED);
    expect(read().entities.get(String(owner))!.flags & ENTITY_FLAG.TIME_STOPPED).toBe(0);
    // Match-controller countdown proceeds while the action clocks are held.
    const tick = world.tick;
    ctl.tick(); expect(world.tick).toBe(tick + 1);
    world.tick += 36; timeStopSystem(world);
    expect(read().entities.has(String(id))).toBe(false);
    expect(read().entities.get(String(enemy))!.flags & ENTITY_FLAG.TIME_STOPPED).toBe(0);

  });
});

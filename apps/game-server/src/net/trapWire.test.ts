import { describe, it, expect } from "vitest";
import { Decoder, Encoder } from "@colyseus/schema";
import { ENTITY_KIND, MatchState } from "@ggd/shared/protocol/schema";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import { trapSystem, interceptTrapAttack } from "@ggd/shared/sim/traps";
import { MatchController } from "../match/MatchController";
import { fullStateBytes } from "../testkit/wireFullState";
import { projectSnapshot } from "./snapshot";

describe("trap snapshot transport", () => {
  it("new clients receive the placed/armed trap and consumption removes the wire entity", () => {
    const ctl = new MatchController("trap-wire", 42, Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
      { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 });
    while (ctl.phase.phase !== "combat") ctl.tick();
    const world = ctl.world, owner = [...world.champion.keys()][0]!, t = world.transform.get(owner)!;
    const enemy = [...world.champion.keys()].find(id => world.team.get(id)!.teamId !== world.team.get(owner)!.teamId)!;
    world.transform.get(enemy)!.pos = { ...t.pos }; world.transform.get(enemy)!.zone = t.zone;
    runEffects([{ kind: "trap", radius: 2.5, durationSec: 5, armDelaySec: 0.3, onTrigger: [{ kind: "damage", amount: { flat: 10 } }] }],
      { world, caster: owner, targets: [], point: { ...t.pos }, rank: 1, origin: "ability:trap-wire", rng: world.rng });
    const id = [...world.trap.keys()][0]!;
    const read = () => {
      const state = new MatchState(); projectSnapshot(ctl, state, new Map());
      const encoded = fullStateBytes(new Encoder(state), state), decoded = new MatchState();
      new Decoder(decoded).decode(encoded, { offset: 1 }); return decoded;
    };
    const first = read().entities.get(String(id))!;
    expect(first).toMatchObject({ kind: ENTITY_KIND.TRAP, hp: 0, maxHp: 0, shield: 2.5, mana: world.team.get(owner)!.teamId, maxMana: 0, alive: true });
    world.tick += 10; expect(read().entities.get(String(id))!.hp).toBe(1);
    expect(interceptTrapAttack(world, enemy, owner)).toBe(true);
    expect(read().entities.has(String(id))).toBe(false); trapSystem(world);
  });
});
